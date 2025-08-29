// app/api/tournaments/[id]/promote-teams/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promoteTeamsToFinalTournament } from '@/lib/tournament-promotion';
import { auth } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 手動で決勝トーナメント進出処理をトリガーする（テスト用）
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 管理者権限チェック
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

    console.log(`[API] 手動進出処理開始: Tournament ${tournamentId}`);

    // 決勝トーナメント進出処理を実行
    await promoteTeamsToFinalTournament(tournamentId);

    console.log(`[API] 手動進出処理完了: Tournament ${tournamentId}`);

    return NextResponse.json({
      success: true,
      message: '決勝トーナメント進出処理が完了しました'
    });

  } catch (error) {
    console.error('手動進出処理エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '進出処理に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}