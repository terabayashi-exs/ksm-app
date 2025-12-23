// プラン変更API
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCurrentPlan, recalculateUsage } from '@/lib/subscription/subscription-service';
import { canChangePlan } from '@/lib/subscription/plan-checker';

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { newPlanId } = await request.json();

    if (!newPlanId) {
      return NextResponse.json({ error: 'プランIDは必須です' }, { status: 400 });
    }

    const adminLoginId = session.user.id;

    // 現在のプラン取得
    const currentPlan = await getCurrentPlan(adminLoginId);
    if (!currentPlan) {
      return NextResponse.json({ error: '現在のプラン情報が見つかりません' }, { status: 404 });
    }

    // 同じプランへの変更をチェック
    if (currentPlan.plan_id === newPlanId) {
      return NextResponse.json({ error: '既に選択されているプランです' }, { status: 400 });
    }

    // 新しいプランが存在するか確認
    const newPlanResult = await db.execute(
      `SELECT * FROM m_subscription_plans WHERE plan_id = ? AND is_active = 1`,
      [newPlanId]
    );

    if (newPlanResult.rows.length === 0) {
      return NextResponse.json({ error: '指定されたプランが見つかりません' }, { status: 404 });
    }

    // プラン変更可否チェック（アーカイブ除外ロジック）
    const changeCheck = await canChangePlan(adminLoginId, newPlanId);
    if (!changeCheck.allowed) {
      return NextResponse.json({
        success: false,
        error: changeCheck.reason,
        blockers: changeCheck.blockers
      }, { status: 403 });
    }

    // 既存のサブスクリプションを終了
    await db.execute(
      `UPDATE t_administrator_subscriptions
       SET end_date = datetime('now', '+9 hours')
       WHERE admin_login_id = ? AND subscription_status = 'active'`,
      [adminLoginId]
    );

    // 新しいサブスクリプション履歴を作成
    await db.execute(
      `INSERT INTO t_administrator_subscriptions
       (admin_login_id, plan_id, subscription_status, start_date, changed_from_plan_id, change_reason)
       VALUES (?, ?, 'active', datetime('now', '+9 hours'), ?, 'user_change')`,
      [adminLoginId, newPlanId, currentPlan.plan_id]
    );

    // m_administratorsを更新
    await db.execute(
      `UPDATE m_administrators
       SET current_plan_id = ?,
           plan_changed_at = datetime('now', '+9 hours'),
           free_trial_end_date = NULL
       WHERE admin_login_id = ?`,
      [newPlanId, adminLoginId]
    );

    // 使用状況を再計算（アーカイブ除外）
    await recalculateUsage(adminLoginId);

    return NextResponse.json({
      success: true,
      message: 'プランを変更しました',
    });
  } catch (error) {
    console.error('Plan change error:', error);
    return NextResponse.json({ error: 'プラン変更中にエラーが発生しました' }, { status: 500 });
  }
}
