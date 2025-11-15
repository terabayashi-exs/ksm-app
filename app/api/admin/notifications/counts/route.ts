// app/api/admin/notifications/counts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// 大会別の通知件数を取得
export async function GET(_request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    // 大会別の未解決通知件数を取得
    const notificationCounts = await db.execute(`
      SELECT 
        tournament_id,
        COUNT(*) as notification_count
      FROM t_tournament_notifications 
      WHERE is_resolved = 0
      GROUP BY tournament_id
    `);

    // 結果をオブジェクト形式に変換 { tournament_id: count }
    const countsMap: Record<number, number> = {};
    notificationCounts.rows.forEach((row) => {
      const tournamentId = row.tournament_id as number;
      const count = row.notification_count as number;
      countsMap[tournamentId] = count;
    });

    return NextResponse.json({
      success: true,
      data: countsMap
    });

  } catch (error) {
    console.error('通知件数取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '通知件数の取得に失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}