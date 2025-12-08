// app/api/tournaments/[id]/teams/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSimpleTournamentTeams } from '@/lib/tournament-teams-simple';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

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

    // セッション情報を取得
    const session = await auth();
    const isAdmin = session?.user?.role === 'admin';

    // 大会の選手情報公開設定を取得
    const tournamentResult = await db.execute({
      sql: 'SELECT show_players_public FROM t_tournaments WHERE tournament_id = ?',
      args: [tournamentId]
    });

    const showPlayersPublic = tournamentResult.rows.length > 0
      ? Number(tournamentResult.rows[0].show_players_public) === 1
      : false;

    // 選手情報を表示可能かどうかを判定
    // 管理者は常に閲覧可能、一般ユーザーは公開設定の場合のみ閲覧可能
    const canViewPlayers = isAdmin || showPlayersPublic;

    // 参加チーム情報を取得
    const teamsData = await getSimpleTournamentTeams(tournamentId);

    return NextResponse.json({
      success: true,
      data: teamsData,
      canViewPlayers,
      showPlayersPublic,
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