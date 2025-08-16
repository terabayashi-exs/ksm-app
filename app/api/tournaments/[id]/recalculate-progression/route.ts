// app/api/tournaments/[id]/recalculate-progression/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { recalculateAllTournamentProgression } from '@/lib/tournament-progression';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// トーナメント進出を再計算
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    console.log(`[RECALCULATE_PROGRESSION] Starting recalculation for tournament ${tournamentId}`);
    
    // トーナメント進出を再計算
    await recalculateAllTournamentProgression(tournamentId);
    
    console.log(`[RECALCULATE_PROGRESSION] ✅ Completed recalculation for tournament ${tournamentId}`);

    return NextResponse.json({
      success: true,
      message: 'トーナメント進出を再計算しました',
      data: {
        tournament_id: tournamentId,
        recalculated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Tournament progression recalculation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'トーナメント進出の再計算に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}