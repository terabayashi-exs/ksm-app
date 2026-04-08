// app/api/admin/tournaments/[id]/files/stats/route.ts
// ファイル管理画面用の統計情報取得API

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ success: false, error: "権限がありません" }, { status: 403 });
    }

    const { id } = await context.params;
    const tournamentId = parseInt(id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効な大会IDです" }, { status: 400 });
    }

    // 大会情報を取得
    const tournamentResult = await db.execute(
      `
      SELECT tournament_name
      FROM t_tournaments
      WHERE tournament_id = ?
    `,
      [tournamentId],
    );

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "大会が見つかりません" }, { status: 404 });
    }

    const tournament = tournamentResult.rows[0];

    // ファイル統計情報を取得
    const statsResult = await db.execute(
      `
      SELECT
        COUNT(*) as total_count,
        COUNT(CASE WHEN link_type = 'upload' THEN 1 END) as upload_files,
        COUNT(CASE WHEN link_type = 'external' THEN 1 END) as external_links,
        COALESCE(SUM(CASE WHEN link_type = 'upload' THEN file_size ELSE 0 END), 0) as total_size,
        COUNT(CASE WHEN is_public = 1 THEN 1 END) as public_count
      FROM t_tournament_files
      WHERE tournament_id = ?
    `,
      [tournamentId],
    );

    const stats = statsResult.rows[0];

    // お知らせ件数を取得
    const noticeResult = await db.execute(
      `
      SELECT
        COUNT(*) as total_notices,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_notices
      FROM t_tournament_notices
      WHERE tournament_id = ?
    `,
      [tournamentId],
    );

    const noticeStats = noticeResult.rows[0];

    return NextResponse.json({
      success: true,
      tournament_name: String(tournament.tournament_name),
      total_count: Number(stats.total_count),
      upload_files: Number(stats.upload_files),
      external_links: Number(stats.external_links),
      total_size: Number(stats.total_size),
      public_count: Number(stats.public_count),
      total_notices: Number(noticeStats.total_notices),
      active_notices: Number(noticeStats.active_notices),
    });
  } catch (error) {
    console.error("ファイル統計情報取得エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "ファイル統計情報の取得に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      },
      { status: 500 },
    );
  }
}
