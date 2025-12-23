// プラン変更可否チェックAPI
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { canChangePlan } from '@/lib/subscription/plan-checker';

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const newPlanId = searchParams.get('new_plan_id');

    if (!newPlanId) {
      return NextResponse.json({ error: 'new_plan_idは必須です' }, { status: 400 });
    }

    const adminLoginId = session.user.id;
    const result = await canChangePlan(adminLoginId, Number(newPlanId));

    return NextResponse.json({
      allowed: result.allowed,
      reason: result.reason,
      blockers: result.blockers,
    });
  } catch (error) {
    console.error('Plan change check error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
