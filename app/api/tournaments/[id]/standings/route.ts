// app/api/tournaments/[id]/standings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTournamentStandings } from '@/lib/standings-calculator';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 順位表を取得（team_rankingsから）
    const standings = await getTournamentStandings(tournamentId);

    // 戦績表と同じロジックで統計情報を計算
    // 参加チーム数を計算（全ブロックのチーム数合計）
    const totalTeamsResult = await db.execute({
      sql: `
        SELECT COUNT(DISTINCT tt.team_id) as total_teams
        FROM t_tournament_teams tt
        WHERE tt.tournament_id = ?
        AND tt.withdrawal_status = 'active'
      `,
      args: [tournamentId]
    });

    // 実施済み試合数を計算（確定済み試合数）
    const totalMatchesResult = await db.execute({
      sql: `
        SELECT COUNT(*) as total_matches
        FROM t_matches_final mf
        JOIN t_matches_live ml ON mf.match_id = ml.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
      `,
      args: [tournamentId]
    });

    const totalTeams = totalTeamsResult.rows[0]?.total_teams as number || 0;
    const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;

    return NextResponse.json({
      success: true,
      data: standings,
      total_matches: totalMatches,
      total_teams: totalTeams,
      message: '順位表を正常に取得しました'
    });

  } catch (error) {
    console.error('順位表取得API エラー:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '順位表の取得に失敗しました',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}