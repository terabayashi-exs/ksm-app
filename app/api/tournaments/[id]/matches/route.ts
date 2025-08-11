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
    console.log('API /tournaments/[id]/matches - Session check:', {
      hasSession: !!session,
      userRole: session?.user?.role,
      userId: session?.user?.id
    });
    
    if (!session || session.user.role !== 'admin') {
      console.log('Authentication failed:', { session: !!session, role: session?.user?.role });
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

    // 試合データを取得（試合状態と確定結果も含む）
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
        ml.current_period,
        ml.winner_team_id,
        ml.match_status as live_match_status,
        ml.actual_start_time,
        ml.actual_end_time,
        ml.remarks,
        ml.confirmed_by,
        mb.phase,
        mb.display_round_name,
        mb.block_name,
        mb.match_type,
        mb.block_order,
        -- 実際のチーム名を取得
        t1.team_name as team1_real_name,
        t2.team_name as team2_real_name,
        -- 試合状態テーブルから情報取得
        ms.match_status,
        ms.current_period as status_current_period,
        ms.actual_start_time as status_actual_start_time,
        ms.actual_end_time as status_actual_end_time,
        ms.updated_by,
        ms.updated_at,
        -- 確定結果テーブルから情報取得
        mf.team1_goals as final_team1_scores,
        mf.team2_goals as final_team2_scores,
        mf.winner_team_id as final_winner_team_id,
        mf.is_draw as final_is_draw,
        mf.is_walkover as final_is_walkover,
        mf.updated_at as confirmed_at
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams t1 ON ml.team1_id = t1.team_id AND mb.tournament_id = t1.tournament_id
      LEFT JOIN t_tournament_teams t2 ON ml.team2_id = t2.team_id AND mb.tournament_id = t2.tournament_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE mb.tournament_id = ?
      ORDER BY mb.block_order ASC, ml.match_number ASC
    `, [tournamentId]);

    const matches = matchesResult.rows.map(row => {
      // 試合状態の決定（t_match_statusを優先、なければt_matches_liveから）
      const matchStatus = row.match_status || row.live_match_status || 'scheduled';
      
      // 現在のピリオド（t_match_statusを優先）
      const currentPeriod = row.status_current_period || row.current_period || 1;
      
      // 実際の開始・終了時刻（t_match_statusを優先）
      const actualStartTime = row.status_actual_start_time || row.actual_start_time;
      const actualEndTime = row.status_actual_end_time || row.actual_end_time;
      
      // 確定済みかどうかの判定（t_matches_finalにデータがあるかで判定）
      const isConfirmed = !!row.final_team1_scores || !!row.confirmed_at;
      
      // スコア情報（確定済みなら最終結果、そうでなければライブスコア）
      const team1ScoresStr = isConfirmed ? row.final_team1_scores : row.team1_scores;
      const team2ScoresStr = isConfirmed ? row.final_team2_scores : row.team2_scores;
      
      return {
        match_id: Number(row.match_id),
        match_block_id: Number(row.match_block_id),
        tournament_date: String(row.tournament_date || ''),
        match_number: Number(row.match_number),
        match_code: String(row.match_code),
        team1_id: row.team1_id ? String(row.team1_id) : null,
        team2_id: row.team2_id ? String(row.team2_id) : null,
        team1_name: String(row.team1_real_name || row.team1_display_name), // 実チーム名を優先、なければプレースホルダー
        team2_name: String(row.team2_real_name || row.team2_display_name), // 実チーム名を優先、なければプレースホルダー
        court_number: row.court_number ? Number(row.court_number) : null,
        scheduled_time: row.start_time ? String(row.start_time) : null, // scheduled_timeに統一
        period_count: Number(row.period_count || 1),
        current_period: currentPeriod,
        match_status: matchStatus,
        actual_start_time: actualStartTime,
        actual_end_time: actualEndTime,
        updated_by: row.updated_by,
        updated_at: row.updated_at,
        // スコア情報
        team1_scores: team1ScoresStr,
        team2_scores: team2ScoresStr,
        final_team1_scores: row.final_team1_scores,
        final_team2_scores: row.final_team2_scores,
        winner_team_id: row.final_winner_team_id || row.winner_team_id,
        is_confirmed: isConfirmed,
        is_draw: row.final_is_draw ? Boolean(row.final_is_draw) : false,
        is_walkover: row.final_is_walkover ? Boolean(row.final_is_walkover) : false,
        confirmed_at: row.confirmed_at,
        remarks: row.remarks ? String(row.remarks) : null,
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