import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 30分前の時刻を計算（JST）
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const thirtyMinutesAgoJST = new Date(thirtyMinutesAgo.getTime() + 9 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19);
    
    // 速報対象の試合を取得
    const matchesResult = await db.execute(`
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          ml.court_number,
          ml.start_time,
          ml.match_status,
          ml.updated_at,
          ml.team1_scores,
          ml.team2_scores,
          ml.winner_team_id,
          ml.is_draw,
          ml.is_walkover,
          mb.phase,
          mb.block_name,
          -- 確定済み結果があればそちらを優先
          COALESCE(mf.team1_scores, ml.team1_scores) as final_team1_scores,
          COALESCE(mf.team2_scores, ml.team2_scores) as final_team2_scores,
          COALESCE(mf.winner_team_id, ml.winner_team_id) as final_winner_team_id,
          COALESCE(mf.is_draw, ml.is_draw) as final_is_draw,
          COALESCE(mf.is_walkover, ml.is_walkover) as final_is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as has_result
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
          AND (
            ml.match_status = 'ongoing'
            OR 
            (ml.match_status = 'completed' AND ml.updated_at >= ?)
          )
        ORDER BY 
          CASE ml.match_status 
            WHEN 'ongoing' THEN 1
            WHEN 'completed' THEN 2
            ELSE 3
          END,
          ml.updated_at DESC
        LIMIT 6
    `, [tournamentId, thirtyMinutesAgoJST]);

    // データ整形（実際の結果データを使用）
    const formattedMatches = matchesResult.rows.map(row => {
      // 確定済み結果があればそちらを使用、なければライブデータを使用
      // カンマ区切りスコアの合計を計算
      const team1Goals = row.final_team1_scores !== null ? 
        (typeof row.final_team1_scores === 'string' ? 
          row.final_team1_scores.split(',').reduce((sum, score) => sum + (Number(score) || 0), 0) :
          Number(row.final_team1_scores)) :
        (row.team1_scores !== null ? 
          (typeof row.team1_scores === 'string' ? 
            row.team1_scores.split(',').reduce((sum, score) => sum + (Number(score) || 0), 0) :
            Number(row.team1_scores)) : 
          null);
      
      const team2Goals = row.final_team2_scores !== null ? 
        (typeof row.final_team2_scores === 'string' ? 
          row.final_team2_scores.split(',').reduce((sum, score) => sum + (Number(score) || 0), 0) :
          Number(row.final_team2_scores)) :
        (row.team2_scores !== null ? 
          (typeof row.team2_scores === 'string' ? 
            row.team2_scores.split(',').reduce((sum, score) => sum + (Number(score) || 0), 0) :
            Number(row.team2_scores)) : 
          null);

      return {
        match_id: Number(row.match_id),
        match_code: String(row.match_code),
        team1_display_name: String(row.team1_display_name),
        team2_display_name: String(row.team2_display_name),
        team1_goals: team1Goals,
        team2_goals: team2Goals,
        winner_team_id: row.final_winner_team_id ? String(row.final_winner_team_id) : null,
        team1_id: row.team1_id ? String(row.team1_id) : null,
        team2_id: row.team2_id ? String(row.team2_id) : null,
        is_draw: Boolean(row.final_is_draw || false),
        is_walkover: Boolean(row.final_is_walkover || false),
        match_status: String(row.match_status),
        has_result: Boolean(row.has_result || false),
        phase: String(row.phase || 'preliminary'),
        block_name: String(row.block_name || ''),
        court_number: row.court_number ? Number(row.court_number) : null,
        start_time: row.start_time ? String(row.start_time) : null,
        end_time: null, // 終了時刻は別途取得が必要な場合は追加
        updated_at: String(row.updated_at)
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedMatches
    });

  } catch (error) {
    console.error('試合速報データ取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '試合速報データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}