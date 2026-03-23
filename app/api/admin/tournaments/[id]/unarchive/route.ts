// app/api/admin/tournaments/[id]/unarchive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * アンアーカイブAPI（テスト用）
 * is_archived を 0 に戻す。Blob上のHTMLは削除しない（比較用に残す）
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

    // is_archived フラグを 0 に戻す（Blobは削除しない）
    await db.execute(`
      UPDATE t_tournaments
      SET is_archived = 0
      WHERE tournament_id = ?
    `, [tournamentId]);

    console.log(`✅ アンアーカイブ完了: 大会ID ${tournamentId}`);

    return NextResponse.json({
      success: true,
      message: 'アーカイブを解除しました。Blob上のデータは保持されています。',
    });
  } catch (error) {
    console.error('アンアーカイブエラー:', error);
    return NextResponse.json(
      { success: false, error: 'アンアーカイブ処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
