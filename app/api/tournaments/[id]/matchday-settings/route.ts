import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ success: false, error: "権限がありません" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効なIDです" }, { status: 400 });
    }

    // 部門情報を取得
    const tournamentResult = await db.execute(
      `
      SELECT t.tournament_id, t.tournament_name, t.format_name, t.format_id, t.match_duration_minutes, t.venue_id
      FROM t_tournaments t
      WHERE t.tournament_id = ?
    `,
      [tournamentId],
    );

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "部門が見つかりません" }, { status: 404 });
    }

    // 各試合の詳細を取得（試合単位の設定用、チーム略称優先）
    const matchesResult = await db.execute(
      `
      SELECT
        ml.match_id,
        ml.match_number,
        ml.match_code,
        ml.match_type,
        ml.matchday,
        ml.cycle,
        ml.tournament_date,
        ml.start_time,
        ml.court_number,
        ml.venue_name,
        COALESCE(tt1.team_omission, tt1.team_name, ml.team1_display_name) as team1_display_name,
        COALESCE(tt2.team_omission, tt2.team_name, ml.team2_display_name) as team2_display_name,
        ml.block_name,
        ml.court_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      WHERE mb.tournament_id = ? AND ml.matchday IS NOT NULL
      ORDER BY ml.matchday ASC, ml.match_number ASC
    `,
      [tournamentId],
    );

    const matches = matchesResult.rows.map((row) => ({
      match_id: Number(row.match_id),
      match_number: Number(row.match_number),
      match_code: String(row.match_code),
      match_type: String(row.match_type || ""),
      matchday: Number(row.matchday),
      cycle: row.cycle ? Number(row.cycle) : 1,
      tournament_date: (row.tournament_date as string) || "",
      start_time: (row.start_time as string) || "",
      court_number: row.court_number ? Number(row.court_number) : null,
      court_name: (row.court_name as string) || "",
      venue_name: (row.venue_name as string) || "",
      team1_display_name: String(row.team1_display_name),
      team2_display_name: String(row.team2_display_name),
      block_name: (row.block_name as string) || "",
    }));

    // 部門に紐づく会場一覧を取得
    const tournamentVenueId = tournamentResult.rows[0].venue_id
      ? String(tournamentResult.rows[0].venue_id)
      : null;

    let venueIds: number[] = [];
    if (tournamentVenueId) {
      try {
        const parsed = JSON.parse(tournamentVenueId);
        if (Array.isArray(parsed)) {
          venueIds = parsed.map(Number).filter((n: number) => !isNaN(n));
        } else {
          const num = Number(tournamentVenueId);
          if (!isNaN(num)) venueIds = [num];
        }
      } catch {
        const num = Number(tournamentVenueId);
        if (!isNaN(num)) venueIds = [num];
      }
    }

    let venuesResult;
    if (venueIds.length > 0) {
      const placeholders = venueIds.map(() => "?").join(",");
      venuesResult = await db.execute(
        `
        SELECT venue_id, venue_name, available_courts
        FROM m_venues
        WHERE is_active = 1 AND venue_id IN (${placeholders})
        ORDER BY venue_name
      `,
        venueIds,
      );
    } else {
      // 会場未設定の場合は空配列
      venuesResult = { rows: [] };
    }

    return NextResponse.json({
      success: true,
      tournament: tournamentResult.rows[0],
      matches,
      venues: venuesResult.rows.map((v) => ({
        venue_id: Number(v.venue_id),
        venue_name: String(v.venue_name),
        available_courts: Number(v.available_courts || 1),
      })),
    });
  } catch (error) {
    console.error("節設定取得エラー:", error);
    return NextResponse.json(
      { success: false, error: "節設定の取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ success: false, error: "権限がありません" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効なIDです" }, { status: 400 });
    }

    const { matches: matchUpdates } = await request.json();

    if (!Array.isArray(matchUpdates)) {
      return NextResponse.json(
        { success: false, error: "matches は配列である必要があります" },
        { status: 400 },
      );
    }

    // 試合時間を取得（重複チェック用）
    const tournamentResult = await db.execute(
      `
      SELECT match_duration_minutes FROM t_tournaments WHERE tournament_id = ?
    `,
      [tournamentId],
    );

    const matchDuration =
      tournamentResult.rows.length > 0
        ? Number(tournamentResult.rows[0].match_duration_minutes) || 10
        : 10;

    // 日時・コート重複チェック
    // 同じ日付・同じコート名で試合時間が重なる組み合わせがないか検証
    const conflicts: string[] = [];
    for (let i = 0; i < matchUpdates.length; i++) {
      const a = matchUpdates[i];
      if (!a.tournament_date || !a.start_time) continue;

      for (let j = i + 1; j < matchUpdates.length; j++) {
        const b = matchUpdates[j];
        if (!b.tournament_date || !b.start_time) continue;

        // 日付が違えばOK
        if (a.tournament_date !== b.tournament_date) continue;

        // コート名が両方あり、異なればOK
        const courtA = (a.court_name || "").trim();
        const courtB = (b.court_name || "").trim();
        if (courtA && courtB && courtA !== courtB) continue;

        // 時間帯が重複するかチェック
        const [aH, aM] = a.start_time.split(":").map(Number);
        const [bH, bM] = b.start_time.split(":").map(Number);
        const aStart = aH * 60 + aM;
        const aEnd = aStart + matchDuration;
        const bStart = bH * 60 + bM;
        const bEnd = bStart + matchDuration;

        if (aStart < bEnd && bStart < aEnd) {
          const courtLabel = courtA || courtB || "コート未設定";
          conflicts.push(
            `${a.tournament_date} ${a.start_time}～ [${courtLabel}]: 試合ID ${a.match_id} と ${b.match_id} が重複`,
          );
        }
      }
    }

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "日時・コートの重複があります",
          conflicts,
        },
        { status: 400 },
      );
    }

    // 会場名→venue_idのマッピングを構築（Google Mapsリンク用）
    const venueNameToId = new Map<string, number>();
    // match_duration_minutes 取得のクエリにvenue_idが含まれていないため再取得
    const tournamentVenueResult = await db.execute(
      `SELECT venue_id FROM t_tournaments WHERE tournament_id = ?`,
      [tournamentId],
    );
    const venueIdJson = tournamentVenueResult.rows[0]?.venue_id
      ? String(tournamentVenueResult.rows[0].venue_id)
      : null;
    if (venueIdJson) {
      let venueIds: number[] = [];
      try {
        const parsed = JSON.parse(venueIdJson.startsWith("[") ? venueIdJson : `[${venueIdJson}]`);
        if (Array.isArray(parsed)) venueIds = parsed.map(Number).filter((n: number) => !isNaN(n));
      } catch {
        /* ignore */
      }
      if (venueIds.length > 0) {
        const placeholders = venueIds.map(() => "?").join(",");
        const venuesResult = await db.execute(
          `SELECT venue_id, venue_name FROM m_venues WHERE venue_id IN (${placeholders})`,
          venueIds,
        );
        for (const v of venuesResult.rows) {
          venueNameToId.set(String(v.venue_name), Number(v.venue_id));
        }
      }
    }

    // コート名→番号のマッピングを管理（既存の試合データから取得）
    const courtNameToNumber = new Map<string, number>();
    let nextCourtNumber = 1;

    const existingMatches = await db.execute(
      `
      SELECT DISTINCT ml.court_number, ml.court_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND ml.court_number IS NOT NULL
      ORDER BY ml.court_number ASC
    `,
      [tournamentId],
    );

    for (const row of existingMatches.rows) {
      const name = String(row.court_name || "");
      const num = Number(row.court_number);
      if (name) courtNameToNumber.set(name, num);
      if (num >= nextCourtNumber) nextCourtNumber = num + 1;
    }

    for (const match of matchUpdates) {
      const courtName = (match.court_name || "").trim();
      let courtNumber: number | null = null;

      // コート名が入力されている場合、court_numberを解決
      if (courtName) {
        if (courtNameToNumber.has(courtName)) {
          courtNumber = courtNameToNumber.get(courtName)!;
        } else {
          // 新しいコート名 → 新しいcourt_numberを割り当て
          courtNumber = nextCourtNumber++;
          courtNameToNumber.set(courtName, courtNumber);
        }
      }

      // 会場名からvenue_idを解決
      const venueName = (match.venue_name || "").trim();
      const venueId = venueName ? venueNameToId.get(venueName) || null : null;

      await db.execute(
        `
        UPDATE t_matches_live SET
          tournament_date = ?,
          start_time = ?,
          court_number = ?,
          court_name = ?,
          venue_name = ?,
          venue_id = ?,
          updated_at = datetime('now', '+9 hours')
        WHERE match_id = ?
      `,
        [
          match.tournament_date || "",
          match.start_time || null,
          courtNumber,
          courtName || null,
          venueName || null,
          venueId,
          match.match_id,
        ],
      );
    }

    return NextResponse.json({
      success: true,
      message: "節設定を保存しました",
    });
  } catch (error) {
    console.error("節設定保存エラー:", error);
    return NextResponse.json(
      { success: false, error: "節設定の保存に失敗しました" },
      { status: 500 },
    );
  }
}
