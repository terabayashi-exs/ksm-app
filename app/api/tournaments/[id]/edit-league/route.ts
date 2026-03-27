import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTrialExpiredPermission } from "@/lib/subscription/subscription-service";
import { calculateTournamentStatusSync } from "@/lib/tournament-status";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const result = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.format_name,
        t.sport_type_id,
        t.team_count,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.show_players_public,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.group_id,
        t.venue_id,
        tg.group_name,
        st.sport_name,
        tf.default_match_duration,
        tf.default_break_duration
      FROM t_tournaments t
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      LEFT JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "部門が見つかりません" }, { status: 404 });
    }

    const row = result.rows[0];

    // 試合データを取得（スケジュールプレビュー用）
    const matchesResult = await db.execute(`
      SELECT
        ml.match_code,
        ml.match_type,
        ml.matchday,
        ml.cycle,
        ml.team1_display_name,
        ml.team2_display_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND ml.matchday IS NOT NULL
      ORDER BY ml.matchday ASC, ml.match_number ASC
    `, [tournamentId]);

    return NextResponse.json({
      success: true,
      tournament: {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        format_id: Number(row.format_id),
        format_name: String(row.format_name || ''),
        sport_type_id: Number(row.sport_type_id),
        sport_name: String(row.sport_name || ''),
        team_count: Number(row.team_count),
        match_duration_minutes: Number(row.match_duration_minutes),
        break_duration_minutes: Number(row.break_duration_minutes),
        status: String(row.status),
        visibility: String(row.visibility),
        show_players_public: Number(row.show_players_public) === 1,
        public_start_date: String(row.public_start_date || ''),
        recruitment_start_date: String(row.recruitment_start_date || ''),
        recruitment_end_date: String(row.recruitment_end_date || ''),
        group_id: Number(row.group_id),
        group_name: String(row.group_name || ''),
        venue_id: row.venue_id ? String(row.venue_id) : null,
        default_match_duration: row.default_match_duration ? Number(row.default_match_duration) : null,
        default_break_duration: row.default_break_duration ? Number(row.default_break_duration) : null,
      },
      matches: matchesResult.rows.map(r => ({
        match_code: String(r.match_code),
        match_type: String(r.match_type || ''),
        matchday: Number(r.matchday),
        cycle: r.cycle ? Number(r.cycle) : 1,
        team1_display_name: String(r.team1_display_name),
        team2_display_name: String(r.team2_display_name),
      })),
    });
  } catch (error) {
    console.error("リーグ戦部門取得エラー:", error);
    return NextResponse.json(
      { success: false, error: "部門情報の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ success: false, error: "権限がありません" }, { status: 401 });
    }

    const permissionCheck = await checkTrialExpiredPermission(
      session.user.id,
      'canEdit'
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, error: permissionCheck.reason, trialExpired: true },
        { status: 403 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効なIDです" }, { status: 400 });
    }

    const body = await request.json();
    const {
      tournament_name,
      venue_ids,
      match_duration_minutes,
      break_duration_minutes,
      is_public,
      show_players_public,
      public_start_date,
      recruitment_start_date,
      recruitment_end_date,
    } = body;

    if (!tournament_name) {
      return NextResponse.json({ success: false, error: "部門名は必須です" }, { status: 400 });
    }

    // 部門が存在するかチェック
    const existing = await db.execute(`
      SELECT tournament_id, status, tournament_dates FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: "部門が見つかりません" }, { status: 404 });
    }

    const currentStatus = String(existing.rows[0].status);
    const tournamentDates = String(existing.rows[0].tournament_dates || '{"1": ""}');

    // ステータス再計算（ongoing/completedは管理者設定を優先）
    let newStatus: string;
    if (currentStatus === 'ongoing' || currentStatus === 'completed') {
      newStatus = currentStatus;
    } else {
      newStatus = calculateTournamentStatusSync({
        status: currentStatus,
        tournament_dates: tournamentDates,
        recruitment_start_date,
        recruitment_end_date,
        public_start_date,
      });
    }

    // venue_idsをJSON配列文字列に変換
    const venueIdJson = Array.isArray(venue_ids) && venue_ids.length > 0
      ? JSON.stringify(venue_ids)
      : null;

    await db.execute(`
      UPDATE t_tournaments SET
        tournament_name = ?,
        venue_id = ?,
        match_duration_minutes = ?,
        break_duration_minutes = ?,
        status = ?,
        visibility = ?,
        show_players_public = ?,
        public_start_date = ?,
        recruitment_start_date = ?,
        recruitment_end_date = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `, [
      tournament_name,
      venueIdJson,
      match_duration_minutes,
      break_duration_minutes != null ? break_duration_minutes : 0,
      newStatus,
      is_public ? 'open' : 'preparing',
      show_players_public ? 1 : 0,
      public_start_date,
      recruitment_start_date,
      recruitment_end_date,
      tournamentId,
    ]);

    return NextResponse.json({
      success: true,
      message: "部門情報を更新しました",
    });
  } catch (error) {
    console.error("リーグ戦部門更新エラー:", error);
    return NextResponse.json(
      { success: false, error: "部門情報の更新に失敗しました" },
      { status: 500 }
    );
  }
}
