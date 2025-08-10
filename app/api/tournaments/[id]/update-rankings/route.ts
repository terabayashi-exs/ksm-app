// app/api/tournaments/[id]/update-rankings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { updateBlockRankingsOnMatchConfirm, recalculateAllTournamentRankings } from '@/lib/standings-calculator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { matchBlockId, action } = body;

    if (action === 'recalculate_all') {
      // 全ブロックの順位表を再計算
      await recalculateAllTournamentRankings(tournamentId);
      
      return NextResponse.json({
        success: true,
        message: '全ブロックの順位表を再計算しました'
      });
      
    } else if (matchBlockId) {
      // 特定ブロックの順位表を更新
      await updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId);
      
      return NextResponse.json({
        success: true,
        message: `ブロック ${matchBlockId} の順位表を更新しました`
      });
      
    } else {
      return NextResponse.json(
        { success: false, error: 'matchBlockIdまたはactionが必要です' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('順位表更新API エラー:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '順位表の更新に失敗しました',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}