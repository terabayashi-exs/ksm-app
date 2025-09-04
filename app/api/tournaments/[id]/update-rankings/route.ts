// app/api/tournaments/[id]/update-rankings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { updateBlockRankingsOnMatchConfirm, recalculateAllTournamentRankings } from '@/lib/standings-calculator';
import { promoteTeamsToFinalTournament } from '@/lib/tournament-promotion';

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
      // 全ブロックの順位表を再計算（旧処理・互換性のため残す）
      await recalculateAllTournamentRankings(tournamentId);
      
      // 順位表再計算後に進出処理を実行
      try {
        console.log(`[MANUAL] 大会${tournamentId}の手動進出処理を開始`);
        await promoteTeamsToFinalTournament(tournamentId);
        console.log(`[MANUAL] 大会${tournamentId}の手動進出処理完了`);
      } catch (promotionError) {
        console.error(`[MANUAL] 進出処理エラー:`, promotionError);
        // 進出処理がエラーでも順位表更新は成功とする
      }
      
      return NextResponse.json({
        success: true,
        message: '全ブロックの順位表を再計算し、進出処理を実行しました'
      });
      
    } else if (action === 'recalculate_only') {
      // 順位表の再計算のみ（手動設定はリセットされる）
      await recalculateAllTournamentRankings(tournamentId);
      
      return NextResponse.json({
        success: true,
        message: '全ブロックの順位表を再計算しました（手動設定はリセットされました）'
      });
      
    } else if (action === 'promote_only') {
      // 進出処理のみ（現在の順位表を維持）
      try {
        console.log(`[MANUAL] 大会${tournamentId}の進出処理のみ実行を開始`);
        await promoteTeamsToFinalTournament(tournamentId);
        console.log(`[MANUAL] 大会${tournamentId}の進出処理のみ実行完了`);
        
        return NextResponse.json({
          success: true,
          message: '決勝トーナメント進出処理を実行しました'
        });
      } catch (promotionError) {
        console.error(`[MANUAL] 進出処理エラー:`, promotionError);
        return NextResponse.json(
          { 
            success: false, 
            error: '進出処理中にエラーが発生しました',
            details: promotionError instanceof Error ? promotionError.message : String(promotionError)
          },
          { status: 500 }
        );
      }
      
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