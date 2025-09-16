// app/api/tournaments/[id]/archive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { archiveTournamentAsJson } from '@/lib/tournament-json-archiver';

/**
 * 大会をJSONアーカイブとして保存
 */
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
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // JSONアーカイブを実行
    const result = await archiveTournamentAsJson(
      tournamentId,
      session.user.id || session.user.email || 'admin'
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'アーカイブが正常に作成されました',
        data: result.data
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('アーカイブ作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アーカイブ作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}