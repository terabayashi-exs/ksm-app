// app/api/admin/archived-tournaments/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getArchivedTournamentsList } from '@/lib/tournament-json-archiver';

/**
 * アーカイブされた大会一覧を取得（管理者用）
 */
export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    // アーカイブ一覧を取得
    const archives = await getArchivedTournamentsList();

    return NextResponse.json({
      success: true,
      data: archives
    });

  } catch (error) {
    console.error('アーカイブ一覧取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アーカイブ一覧取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}