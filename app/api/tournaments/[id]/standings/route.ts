// app/api/tournaments/[id]/standings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTournamentStandings } from '@/lib/standings-calculator';

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

    return NextResponse.json({
      success: true,
      data: standings,
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