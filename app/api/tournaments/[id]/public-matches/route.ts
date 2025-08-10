// app/api/tournaments/[id]/public-matches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// キャッシュを無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 大会の公開用試合一覧を取得（認証不要）
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // 大会の存在確認と公開状態チェック
    const tournamentResult = await db.execute(`
      SELECT tournament_id, visibility, status FROM t_tournaments 
      WHERE tournament_id = ? AND visibility = 'open'
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つからないか、公開されていません' },
        { status: 404 }
      );
    }

    // t_matches_liveとt_matches_finalを結合して試合データを取得（実際のチーム名も含む）
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
        mb.phase,
        mb.display_round_name,
        mb.block_name,
        mb.match_type,
        mb.block_order,
        -- 実際のチーム名を取得
        t1.team_name as team1_real_name,
        t2.team_name as team2_real_name,
        -- t_matches_finalから結果データを取得
        mf.team1_goals,
        mf.team2_goals,
        mf.winner_team_id,
        mf.is_draw,
        mf.is_walkover,
        mf.remarks as final_remarks,
        mf.confirmed_at
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams t1 ON ml.team1_id = t1.team_id AND mb.tournament_id = t1.tournament_id
      LEFT JOIN t_tournament_teams t2 ON ml.team2_id = t2.team_id AND mb.tournament_id = t2.tournament_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE mb.tournament_id = ?
      ORDER BY mb.block_order ASC, ml.match_number ASC
    `, [tournamentId]);

    const matches = matchesResult.rows.map(row => {
      return {
        match_id: Number(row.match_id),
        match_block_id: Number(row.match_block_id),
        tournament_date: String(row.tournament_date),
        match_number: Number(row.match_number),
        match_code: String(row.match_code),
        team1_id: row.team1_id ? String(row.team1_id) : null,
        team2_id: row.team2_id ? String(row.team2_id) : null,
        team1_display_name: String(row.team1_real_name || row.team1_display_name), // 実チーム名を優先、なければプレースホルダー
        team2_display_name: String(row.team2_real_name || row.team2_display_name), // 実チーム名を優先、なければプレースホルダー
        court_number: row.court_number ? Number(row.court_number) : null,
        start_time: row.start_time ? String(row.start_time) : null,
        // ブロック情報
        phase: String(row.phase),
        display_round_name: String(row.display_round_name),
        block_name: row.block_name ? String(row.block_name) : null,
        match_type: String(row.match_type),
        block_order: Number(row.block_order),
        // 結果情報（t_matches_finalから）
        team1_goals: row.team1_goals ? Number(row.team1_goals) : null,
        team2_goals: row.team2_goals ? Number(row.team2_goals) : null,
        winner_team_id: row.winner_team_id ? String(row.winner_team_id) : null,
        is_draw: row.is_draw ? Boolean(row.is_draw) : false,
        is_walkover: row.is_walkover ? Boolean(row.is_walkover) : false,
        match_status: row.team1_goals !== null ? 'completed' : 'scheduled',
        result_status: row.confirmed_at ? 'confirmed' : (row.team1_goals !== null ? 'pending' : 'none'),
        remarks: row.final_remarks ? String(row.final_remarks) : null,
        // 試合が実施済みかどうか
        has_result: row.team1_goals !== null && row.team2_goals !== null
      };
    });

    return NextResponse.json({
      success: true,
      data: matches
    });

  } catch (error) {
    console.error('公開試合データ取得エラー:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
    console.error('Tournament ID:', tournamentId);
    return NextResponse.json(
      { 
        success: false, 
        error: '試合データの取得に失敗しました',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack available'
      },
      { status: 500 }
    );
  }
}