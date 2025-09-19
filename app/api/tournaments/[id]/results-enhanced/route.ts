// app/api/tournaments/[id]/results-enhanced/route.ts
// 多競技対応の拡張戦績表API
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

    console.log(`[ENHANCED_RESULTS] Tournament ${tournamentId} - Fetching multi-sport match results`);

    // 多競技対応戦績表データを取得
    const results = await getTournamentResults(tournamentId);

    return NextResponse.json({
      success: true,
      data: results,
      message: '拡張戦績表を正常に取得しました'
    });

  } catch (error) {
    console.error('[ENHANCED_RESULTS] API エラー:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: '拡張戦績表の取得に失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}