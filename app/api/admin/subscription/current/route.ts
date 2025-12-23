// 現在のサブスクリプション情報取得API
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCurrentSubscriptionInfo } from '@/lib/subscription/subscription-service';

export async function GET() {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const adminLoginId = session.user.id;

    const subscriptionInfo = await getCurrentSubscriptionInfo(adminLoginId);

    if (!subscriptionInfo) {
      return NextResponse.json({ error: 'サブスクリプション情報が見つかりません' }, { status: 404 });
    }

    return NextResponse.json(subscriptionInfo);
  } catch (error) {
    console.error('Subscription info fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
