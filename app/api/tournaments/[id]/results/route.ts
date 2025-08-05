// app/api/tournaments/[id]/results/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTournamentResults } from '@/lib/match-results-calculator';

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

    // 戦績表データを取得
    const results = await getTournamentResults(tournamentId);

    return NextResponse.json({
      success: true,
      data: results,
      message: '戦績表を正常に取得しました'
    });

  } catch (error) {
    console.error('戦績表取得API エラー:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '戦績表の取得に失敗しました',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}