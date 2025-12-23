// 全プラン一覧取得API
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 全プラン取得
    const plansResult = await db.execute(
      `SELECT
        plan_id,
        plan_name,
        plan_code,
        plan_description,
        monthly_price,
        yearly_price,
        max_tournaments,
        max_divisions_per_tournament,
        display_order
       FROM m_subscription_plans
       WHERE is_active = 1
       ORDER BY display_order ASC`
    );

    return NextResponse.json({ success: true, data: plansResult.rows });
  } catch (error) {
    console.error('Plans fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
