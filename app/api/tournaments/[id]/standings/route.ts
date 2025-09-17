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

    // 総試合数を正確に計算（結果入力済み試合数）
    const totalMatchesResult = await db.execute({
      sql: `
        SELECT COUNT(*) as total_matches
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? 
        AND ml.team1_goals IS NOT NULL 
        AND ml.team2_goals IS NOT NULL
      `,
      args: [tournamentId]
    });

    const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;

    return NextResponse.json({
      success: true,
      data: standings,
      totalMatches: totalMatches,
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