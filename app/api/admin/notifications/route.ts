// app/api/admin/notifications/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAllUnresolvedNotifications } from '@/lib/notifications';

// 全未解決通知を取得
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

    const notifications = await getAllUnresolvedNotifications();

    return NextResponse.json({
      success: true,
      data: notifications
    });

  } catch (error) {
    console.error('通知取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '通知の取得に失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}