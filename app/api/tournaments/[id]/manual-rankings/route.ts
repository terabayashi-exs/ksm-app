// app/api/tournaments/[id]/manual-rankings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TeamStanding } from '@/lib/standings-calculator';

export async function PUT(
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

    const body = await request.json();
    const { matchBlockId, teamRankings } = body;

    if (!matchBlockId || !Array.isArray(teamRankings)) {
      return NextResponse.json(
        { success: false, error: 'matchBlockIdとteamRankings配列が必要です' },
        { status: 400 }
      );
    }

    // 順位データの検証
    const validatedRankings: TeamStanding[] = teamRankings.map((team: any, index: number) => {
      if (!team.team_id || typeof team.team_name !== 'string') {
        throw new Error(`不正な順位データ: インデックス ${index}`);
      }
      
      return {
        team_id: team.team_id,
        team_name: team.team_name,
        team_omission: team.team_omission || undefined,
        position: team.position || (index + 1),
        points: Number(team.points) || 0,
        matches_played: Number(team.matches_played) || 0,
        wins: Number(team.wins) || 0,
        draws: Number(team.draws) || 0,
        losses: Number(team.losses) || 0,
        goals_for: Number(team.goals_for) || 0,
        goals_against: Number(team.goals_against) || 0,
        goal_difference: Number(team.goal_difference) || 0
      };
    });

    // team_rankingsを更新
    await db.execute({
      sql: `
        UPDATE t_match_blocks 
        SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
        WHERE match_block_id = ? AND tournament_id = ?
      `,
      args: [JSON.stringify(validatedRankings), matchBlockId, tournamentId]
    });

    return NextResponse.json({
      success: true,
      message: `ブロック ${matchBlockId} の順位表を手動更新しました`,
      data: validatedRankings
    });

  } catch (error) {
    console.error('手動順位表更新API エラー:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '手動順位表の更新に失敗しました',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}