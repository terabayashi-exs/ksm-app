import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// 試合コメント一覧取得
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
    }

    const { id } = await params;
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効な大会IDです" }, { status: 400 });
    }

    const result = await db.execute(
      `
      SELECT
        ml.match_id,
        ml.match_code,
        ml.tournament_date,
        ml.start_time,
        COALESCE(tt1.team_omission, tt1.team_name, ml.team1_display_name) as team1_display_name,
        COALESCE(tt2.team_omission, tt2.team_name, ml.team2_display_name) as team2_display_name,
        ml.match_comment,
        ml.matchday,
        ml.court_name,
        ml.venue_name,
        mb.phase,
        mb.display_round_name,
        mb.block_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      WHERE mb.tournament_id = ?
      ORDER BY ml.match_id ASC
    `,
      [tournamentId],
    );

    return NextResponse.json({
      success: true,
      matches: result.rows.map((row) => ({
        match_id: Number(row.match_id),
        match_code: String(row.match_code),
        tournament_date: String(row.tournament_date || ""),
        start_time: String(row.start_time || ""),
        team1_display_name: String(row.team1_display_name || ""),
        team2_display_name: String(row.team2_display_name || ""),
        match_comment: row.match_comment ? String(row.match_comment) : null,
        matchday: row.matchday ? Number(row.matchday) : null,
        court_name: row.court_name ? String(row.court_name) : null,
        venue_name: row.venue_name ? String(row.venue_name) : null,
        phase: String(row.phase || ""),
        display_round_name: String(row.display_round_name || ""),
        block_name: row.block_name ? String(row.block_name) : null,
      })),
    });
  } catch (error) {
    console.error("試合コメント取得エラー:", error);
    return NextResponse.json(
      { success: false, error: "試合コメントの取得に失敗しました" },
      { status: 500 },
    );
  }
}

// 試合コメント更新
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
    }

    const { id } = await params;
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効な大会IDです" }, { status: 400 });
    }

    const body = await request.json();
    const { match_id, match_comment } = body;

    if (!match_id) {
      return NextResponse.json({ success: false, error: "match_idは必須です" }, { status: 400 });
    }

    // t_matches_live を更新（updated_atは更新しない：速報表示に影響するため）
    await db.execute(
      `
      UPDATE t_matches_live
      SET match_comment = ?
      WHERE match_id = ?
        AND match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?)
    `,
      [match_comment?.trim() || null, match_id, tournamentId],
    );

    // t_matches_final にも同じ match_id があれば更新
    await db.execute(
      `
      UPDATE t_matches_final
      SET match_comment = ?
      WHERE match_id = ?
        AND match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?)
    `,
      [match_comment?.trim() || null, match_id, tournamentId],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("試合コメント更新エラー:", error);
    return NextResponse.json(
      { success: false, error: "試合コメントの更新に失敗しました" },
      { status: 500 },
    );
  }
}
