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

    // データ整形（安全な方法で）
    const formattedMatches = matchesResult.rows.map(row => ({
      match_id: Number(row.match_id),
      match_code: String(row.match_code),
      team1_display_name: String(row.team1_display_name),
      team2_display_name: String(row.team2_display_name),
      team1_goals: null, // 基本データのみのため
      team2_goals: null, // 基本データのみのため
      winner_team_id: row.team1_id ? String(row.team1_id) : null,
      team1_id: row.team1_id ? String(row.team1_id) : null,
      team2_id: row.team2_id ? String(row.team2_id) : null,
      is_draw: false,
      is_walkover: false,
      match_status: String(row.match_status),
      has_result: Boolean(row.has_result || false),
      phase: 'unknown',
      block_name: row.match_code ? String(row.match_code).match(/([A-Z]+)/)?.[1] || null : null,
      court_number: row.court_number ? Number(row.court_number) : null,
      start_time: row.start_time ? String(row.start_time) : null,
      end_time: null, // 基本データのみのため
      updated_at: String(row.updated_at)
    }));

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