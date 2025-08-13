// app/api/admin/notifications/[id]/resolve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveNotification } from '@/lib/notifications';

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

// 通知を解決済みにする
export async function POST(
  request: NextRequest,
  { params }: RouteParams
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

    // Next.js 15対応：paramsがPromiseかどうかチェック
    let resolvedParams;
    if (params && typeof params.then === 'function') {
      resolvedParams = await params;
    } else {
      resolvedParams = params as { id: string };
    }

    const notificationId = parseInt(resolvedParams.id);
    if (isNaN(notificationId)) {
      return NextResponse.json(
        { success: false, error: '無効な通知IDです' },
        { status: 400 }
      );
    }

    await resolveNotification(notificationId);

    return NextResponse.json({
      success: true,
      message: '通知を解決済みにしました'
    });

  } catch (error) {
    console.error('通知解決エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '通知の解決に失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}