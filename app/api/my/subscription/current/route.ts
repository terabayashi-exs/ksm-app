// マイダッシュボード用：m_login_users のサブスクリプション情報取得API
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const loginUserId = (session.user as { loginUserId?: number }).loginUserId;
    if (!loginUserId) {
      return NextResponse.json({ error: 'ユーザー情報が取得できません' }, { status: 401 });
    }

    // m_login_users の current_plan_id からプラン情報を取得
    const result = await db.execute(`
      SELECT
        p.plan_id,
        p.plan_name,
        p.plan_code,
        p.max_tournaments,
        p.max_divisions_per_tournament
      FROM m_login_users u
      INNER JOIN m_subscription_plans p ON u.current_plan_id = p.plan_id
      WHERE u.login_user_id = ?
    `, [loginUserId]);

    if (result.rows.length === 0) {
      // current_plan_id 未設定の場合はフリープランを返す
      const freePlan = await db.execute(`
        SELECT plan_id, plan_name, plan_code, max_tournaments, max_divisions_per_tournament
        FROM m_subscription_plans
        WHERE plan_code = 'free'
        LIMIT 1
      `);

      if (freePlan.rows.length === 0) {
        return NextResponse.json({ error: 'プラン情報が見つかりません' }, { status: 404 });
      }

      const plan = freePlan.rows[0];
      return NextResponse.json({
        plan: {
          plan_id: Number(plan.plan_id),
          plan_name: String(plan.plan_name),
          plan_code: String(plan.plan_code),
          max_tournaments: Number(plan.max_tournaments),
          max_divisions_per_tournament: Number(plan.max_divisions_per_tournament),
        },
        usage: { current_tournament_groups_count: 0, current_tournaments_count: 0 },
        freeTrialEndDate: null,
        isTrialExpired: false,
        canCreateTournament: true,
        remainingDays: null,
      });
    }

    const plan = result.rows[0];
    return NextResponse.json({
      plan: {
        plan_id: Number(plan.plan_id),
        plan_name: String(plan.plan_name),
        plan_code: String(plan.plan_code),
        max_tournaments: Number(plan.max_tournaments),
        max_divisions_per_tournament: Number(plan.max_divisions_per_tournament),
      },
      usage: { current_tournament_groups_count: 0, current_tournaments_count: 0 },
      freeTrialEndDate: null,
      isTrialExpired: false,
      canCreateTournament: true,
      remainingDays: null,
    });

  } catch (error) {
    console.error('My subscription info fetch error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
