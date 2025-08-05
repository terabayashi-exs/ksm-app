// app/api/matches/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { confirmMatchResult, confirmMultipleMatchResults } from '@/lib/match-result-handler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, matchIds } = body;

    if (matchIds && Array.isArray(matchIds)) {
      // 複数試合の一括確定
      await confirmMultipleMatchResults(matchIds);
      
      return NextResponse.json({
        success: true,
        message: `${matchIds.length}試合の結果を確定しました`
      });
      
    } else if (matchId) {
      // 単一試合の確定
      await confirmMatchResult(matchId);
      
      return NextResponse.json({
        success: true,
        message: `試合 ${matchId} の結果を確定しました`
      });
      
    } else {
      return NextResponse.json(
        { success: false, error: 'matchIdまたはmatchIds配列が必要です' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('試合結果確定API エラー:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '試合結果の確定に失敗しました',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}