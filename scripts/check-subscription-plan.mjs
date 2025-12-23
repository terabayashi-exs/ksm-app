#!/usr/bin/env node
/**
 * サブスクリプションプランを確認するスクリプト
 */
import { createClient } from '@libsql/client';

const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function main() {
  try {
    // 管理者のプラン情報を取得
    const result = await db.execute(`
      SELECT
        a.admin_login_id,
        a.current_plan_id,
        p.plan_name,
        p.plan_code,
        p.max_tournaments,
        p.max_divisions_per_tournament,
        u.current_tournament_groups_count,
        u.current_tournaments_count
      FROM m_administrators a
      LEFT JOIN m_subscription_plans p ON a.current_plan_id = p.plan_id
      LEFT JOIN t_subscription_usage u ON a.admin_login_id = u.admin_login_id
      WHERE a.admin_login_id = 'admin'
    `);

    if (result.rows.length === 0) {
      console.log('管理者が見つかりませんでした');
      return;
    }

    const admin = result.rows[0];
    console.log('=== サブスクリプションプラン情報 ===');
    console.log(`管理者ID: ${admin.admin_login_id}`);
    console.log(`プランID: ${admin.current_plan_id}`);
    console.log(`プラン名: ${admin.plan_name}`);
    console.log(`プランコード: ${admin.plan_code}`);
    console.log(`大会数上限: ${admin.max_tournaments === -1 ? '無制限' : admin.max_tournaments}`);
    console.log(`1大会あたり部門数上限: ${admin.max_divisions_per_tournament === -1 ? '無制限' : admin.max_divisions_per_tournament}`);
    console.log('');
    console.log('=== 使用状況 ===');
    console.log(`現在の大会数: ${admin.current_tournament_groups_count || 0}`);
    console.log(`現在の部門数: ${admin.current_tournaments_count || 0}`);

    // 大会ごとの部門数を取得
    const groupsResult = await db.execute(`
      SELECT
        tg.group_id,
        tg.group_name,
        COUNT(t.tournament_id) as division_count
      FROM t_tournament_groups tg
      LEFT JOIN t_tournaments t ON tg.group_id = t.group_id
      WHERE tg.admin_login_id = 'admin'
      GROUP BY tg.group_id, tg.group_name
      ORDER BY tg.group_id
    `);

    if (groupsResult.rows.length > 0) {
      console.log('');
      console.log('=== 大会別部門数 ===');
      groupsResult.rows.forEach((row) => {
        console.log(`大会ID ${row.group_id}: ${row.group_name} - ${row.division_count}部門`);
      });
    }

  } catch (error) {
    console.error('エラー:', error);
  }
}

main();
