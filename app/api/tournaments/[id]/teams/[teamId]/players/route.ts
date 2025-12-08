// app/api/tournaments/[id]/teams/[teamId]/players/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTeamPlayers } from '@/lib/tournament-teams-calculator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id, 10);
    const tournamentTeamId = parseInt(resolvedParams.teamId, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    if (isNaN(tournamentTeamId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会参加チームIDです' },
        { status: 400 }
      );
    }

    // チームの選手一覧を取得（tournament_team_idを使用）
    const players = await getTeamPlayers(tournamentId, tournamentTeamId);

    return NextResponse.json({
      success: true,
      data: players,
      message: '選手一覧を正常に取得しました'
    });

  } catch (error) {
    console.error('選手一覧取得API エラー:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '選手一覧の取得に失敗しました',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}