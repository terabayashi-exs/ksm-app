// app/api/tournaments/[id]/match-overrides/affected/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: 特定の進出条件を使用している試合を取得
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック（管理者権限必須）
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // クエリパラメータから検索する進出条件を取得
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');

    if (!source) {
      return NextResponse.json(
        { success: false, error: '検索する進出条件を指定してください' },
        { status: 400 }
      );
    }

    // 大会のフォーマットを取得
    const tournamentResult = await db.execute(`
      SELECT format_id FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const formatId = tournamentResult.rows[0].format_id;

    // 指定された進出条件を使用しているテンプレートを検索
    const templatesResult = await db.execute(`
      SELECT
        match_code,
        round_name,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name
      FROM m_match_templates
      WHERE format_id = ?
        AND phase = 'final'
        AND (team1_source = ? OR team2_source = ?)
      ORDER BY execution_priority, match_code
    `, [formatId, source, source]);

    const affectedMatches = templatesResult.rows.map(row => ({
      match_code: String(row.match_code),
      round_name: String(row.round_name),
      team1_source: row.team1_source ? String(row.team1_source) : null,
      team2_source: row.team2_source ? String(row.team2_source) : null,
      team1_display_name: String(row.team1_display_name),
      team2_display_name: String(row.team2_display_name),
    }));

    return NextResponse.json({
      success: true,
      data: affectedMatches
    });

  } catch (error) {
    console.error('影響を受ける試合の取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '影響を受ける試合の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
