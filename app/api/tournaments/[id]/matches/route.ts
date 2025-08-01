// app/api/tournaments/[id]/matches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// キャッシュを無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 大会の試合一覧を取得
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
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

    // 大会の存在確認
    const tournamentResult = await db.execute(`
      SELECT tournament_id FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // 試合データを取得
    // Fetching matches for tournament
    const matchesResult = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_block_id,
        ml.tournament_date,
        ml.match_number,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.court_number,
        ml.start_time,
        ml.team1_scores,
        ml.team2_scores,
        ml.period_count,
        ml.winner_team_id,
        ml.remarks,
        ml.confirmed_by,
        mb.phase,
        mb.display_round_name,
        mb.block_name,
        mb.match_type,
        mb.block_order
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
      ORDER BY mb.block_order ASC, ml.match_number ASC
    `, [tournamentId]);

    const matches = matchesResult.rows.map(row => {
      // team1_scores/team2_scoresは現在は使用していないが、将来の拡張用に保持
      // 現在はシンプルなゴール数として0を返す
      const team1Goals = 0; // 将来的にはrow.team1_scoresをパース
      const team2Goals = 0; // 将来的にはrow.team2_scoresをパース
      
      return {
        match_id: Number(row.match_id),
        match_block_id: Number(row.match_block_id),
        tournament_date: String(row.tournament_date),
        match_number: Number(row.match_number),
        match_code: String(row.match_code),
        team1_id: row.team1_id ? String(row.team1_id) : null,
        team2_id: row.team2_id ? String(row.team2_id) : null,
        team1_display_name: String(row.team1_display_name),
        team2_display_name: String(row.team2_display_name),
        court_number: row.court_number ? Number(row.court_number) : null,
        start_time: row.start_time ? String(row.start_time) : null,
        team1_goals: team1Goals,
        team2_goals: team2Goals,
        team1_scores: row.team1_scores ? String(row.team1_scores) : null,
        team2_scores: row.team2_scores ? String(row.team2_scores) : null,
        period_count: Number(row.period_count || 1),
        winner_team_id: row.winner_team_id ? String(row.winner_team_id) : null,
        match_status: 'scheduled' as const, // 現在は全て予定として扱う
        result_status: 'none' as const, // 現在は全て未確定として扱う
        remarks: row.remarks ? String(row.remarks) : null,
        confirmed_by: row.confirmed_by ? String(row.confirmed_by) : null,
        // ブロック情報
        phase: String(row.phase),
        display_round_name: String(row.display_round_name),
        block_name: row.block_name ? String(row.block_name) : null,
        match_type: String(row.match_type),
        block_order: Number(row.block_order)
      };
    });

    return NextResponse.json({
      success: true,
      data: matches
    });

  } catch (error) {
    console.error('試合データ取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '試合データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}