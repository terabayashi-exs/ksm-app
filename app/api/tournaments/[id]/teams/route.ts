// app/api/tournaments/[id]/teams/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSimpleTournamentTeams } from '@/lib/tournament-teams-simple';

// APIルートは動的に実行する（静的最適化を無効化）
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let tournamentId: number = 0; // Initialize with default value
  
  try {
    const resolvedParams = await params;
    tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 参加チーム情報を取得
    const teamsData = await getSimpleTournamentTeams(tournamentId);

    return NextResponse.json({
      success: true,
      data: teamsData,
      message: '参加チーム情報を正常に取得しました'
    });

  } catch (error) {
    console.error('参加チーム取得API エラー:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '参加チーム情報の取得に失敗しました',
        details: process.env.NODE_ENV === 'development' ? {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          tournamentId
        } : undefined
      },
      { status: 500 }
    );
  }
}