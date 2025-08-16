import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid tournament ID' },
        { status: 400 }
      );
    }

    // まず基本的なクエリでデータを取得
    const query = `
      SELECT DISTINCT
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
        COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
        COALESCE(mf.team1_scores, '0') as team1_goals,
        COALESCE(mf.team2_scores, '0') as team2_goals,
        mf.winner_team_id,
        COALESCE(mf.is_draw, 0) as is_draw,
        COALESCE(mf.is_walkover, 0) as is_walkover,
        ml.match_status,
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
        ml.match_number as execution_priority,
        ml.start_time,
        ml.court_number
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
      LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
      WHERE mb.tournament_id = ? 
        AND mb.phase = 'final'
      ORDER BY ml.match_number, ml.match_code
    `;

    // execution_groupを取得するための別クエリ
    const executionGroupQuery = `
      SELECT 
        mt.match_code,
        mt.execution_group
      FROM m_match_templates mt
      INNER JOIN t_tournaments t ON t.format_id = mt.format_id
      WHERE t.tournament_id = ?
        AND mt.phase = 'final'
    `;

    const matches = await db.execute(query, [tournamentId]);

    // トーナメント試合が存在しない場合は404を返す
    if (!matches.rows || matches.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'この大会にはトーナメント戦がありません' },
        { status: 404 }
      );
    }

    // execution_groupを取得
    let executionGroupMap = new Map<string, number>();
    try {
      const executionGroupResult = await db.execute(executionGroupQuery, [tournamentId]);
      executionGroupResult.rows.forEach(row => {
        executionGroupMap.set(row.match_code as string, row.execution_group as number);
      });
    } catch (error) {
      console.warn('execution_group取得に失敗しました:', error);
      // execution_groupが取得できなくても続行（フォールバック処理がある）
    }

    // データを整形
    const bracketData = matches.rows.map(row => ({
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_id: row.team1_id as string | undefined,
      team2_id: row.team2_id as string | undefined,
      team1_display_name: row.team1_display_name as string,
      team2_display_name: row.team2_display_name as string,
      team1_goals: parseInt(row.team1_goals as string) || 0,
      team2_goals: parseInt(row.team2_goals as string) || 0,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      match_status: row.match_status as 'scheduled' | 'ongoing' | 'completed' | 'cancelled',
      is_confirmed: Boolean(row.is_confirmed),
      execution_priority: row.execution_priority as number,
      start_time: row.start_time as string | null,
      court_number: row.court_number as number | null,
      execution_group: executionGroupMap.get(row.match_code as string) || null,
    }));

    return NextResponse.json({
      success: true,
      data: bracketData
    });

  } catch (error) {
    console.error('Error fetching tournament bracket:', error);
    return NextResponse.json(
      { success: false, error: `データの取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}