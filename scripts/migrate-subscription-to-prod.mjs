#!/usr/bin/env node
/**
 * 本番環境へのサブスクリプション機能マイグレーション
 *
 * このスクリプトは以下を実行します：
 * 1. サブスクリプションプランマスタの追加
 * 2. m_administratorsテーブルへのサブスクリプション関連カラム追加
 * 3. サブスクリプション履歴テーブルの作成
 * 4. 使用状況管理テーブルの作成
 */

import { createClient } from '@libsql/client';

// 本番環境の接続情報
const db = createClient({
  url: "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg"
});

async function main() {
  console.log('🚀 本番環境へのサブスクリプション機能マイグレーションを開始します...\n');

  try {
    // ========================================
    // 1. m_subscription_plans テーブルの作成
    // ========================================
    console.log('📋 Step 1: サブスクリプションプランマスタテーブルを作成...');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_subscription_plans (
        plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_name TEXT NOT NULL,
        plan_code TEXT NOT NULL UNIQUE,
        plan_description TEXT,
        monthly_price INTEGER NOT NULL DEFAULT 0,
        yearly_price INTEGER NOT NULL DEFAULT 0,
        max_tournaments INTEGER NOT NULL DEFAULT -1,
        max_divisions_per_tournament INTEGER NOT NULL DEFAULT -1,
        max_teams_per_tournament INTEGER NOT NULL DEFAULT -1,
        max_storage_gb INTEGER NOT NULL DEFAULT -1,
        trial_period_days INTEGER DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
      )
    `);
    console.log('✅ m_subscription_plans テーブルを作成しました\n');

    // ========================================
    // 2. プランマスタデータの投入
    // ========================================
    console.log('📋 Step 2: プランマスタデータを投入...');

    // 既存データの確認
    const existingPlans = await db.execute('SELECT COUNT(*) as count FROM m_subscription_plans');
    const planCount = existingPlans.rows[0]?.count || 0;

    if (planCount === 0) {
      await db.execute(`
        INSERT INTO m_subscription_plans
        (plan_name, plan_code, plan_description, monthly_price, yearly_price, max_tournaments, max_divisions_per_tournament, max_teams_per_tournament, max_storage_gb, trial_period_days, is_active, display_order)
        VALUES
        ('無料トライアル（1年間）', 'free', '1年間全機能を無料でお試しいただけます（Premium相当）', 0, 0, -1, -1, -1, -1, 365, 1, 1),
        ('ベーシックプラン', 'basic', '小規模な大会運営に最適なプラン', 980, 9800, 3, 1, 32, 5, 0, 1, 2),
        ('スタンダードプラン', 'standard', '中規模な大会運営に最適なプラン', 2980, 29800, 10, 3, 64, 20, 0, 1, 3),
        ('プレミアムプラン', 'premium', '大規模な大会運営に最適なプラン（無制限）', 9800, 98000, -1, -1, -1, -1, 0, 1, 4)
      `);
      console.log('✅ プランマスタデータを投入しました（4プラン）\n');
    } else {
      console.log(`ℹ️  既にプランマスタデータが存在します（${planCount}件）\n`);
    }

    // ========================================
    // 3. m_administrators テーブルへのカラム追加
    // ========================================
    console.log('📋 Step 3: m_administrators テーブルにサブスクリプション関連カラムを追加...');

    // カラムの存在確認
    const tableInfo = await db.execute(`PRAGMA table_info(m_administrators)`);
    const columns = tableInfo.rows.map(row => row.name);

    const columnsToAdd = [
      { name: 'current_plan_id', sql: 'ALTER TABLE m_administrators ADD COLUMN current_plan_id INTEGER DEFAULT 1' },
      { name: 'free_trial_end_date', sql: 'ALTER TABLE m_administrators ADD COLUMN free_trial_end_date TEXT' },
      { name: 'plan_changed_at', sql: 'ALTER TABLE m_administrators ADD COLUMN plan_changed_at TEXT' }
    ];

    for (const col of columnsToAdd) {
      if (!columns.includes(col.name)) {
        await db.execute(col.sql);
        console.log(`  ✅ ${col.name} カラムを追加しました`);
      } else {
        console.log(`  ℹ️  ${col.name} カラムは既に存在します`);
      }
    }
    console.log('');

    // ========================================
    // 4. 既存管理者のトライアル期限設定
    // ========================================
    console.log('📋 Step 4: 既存管理者にトライアル期限を設定...');

    await db.execute(`
      UPDATE m_administrators
      SET free_trial_end_date = datetime('now', '+1 year', '+9 hours')
      WHERE free_trial_end_date IS NULL
    `);
    console.log('✅ 既存管理者に1年間のトライアル期限を設定しました\n');

    // ========================================
    // 5. t_administrator_subscriptions テーブルの作成
    // ========================================
    console.log('📋 Step 5: サブスクリプション履歴テーブルを作成...');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_administrator_subscriptions (
        subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_login_id TEXT NOT NULL,
        plan_id INTEGER NOT NULL,
        subscription_status TEXT NOT NULL DEFAULT 'active',
        start_date TEXT NOT NULL,
        end_date TEXT,
        changed_from_plan_id INTEGER,
        change_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (admin_login_id) REFERENCES m_administrators(admin_login_id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES m_subscription_plans(plan_id),
        FOREIGN KEY (changed_from_plan_id) REFERENCES m_subscription_plans(plan_id)
      )
    `);
    console.log('✅ t_administrator_subscriptions テーブルを作成しました\n');

    // ========================================
    // 6. t_subscription_usage テーブルの作成
    // ========================================
    console.log('📋 Step 6: 使用状況管理テーブルを作成...');

    // 古いスキーマのテーブルが存在する場合は削除
    const usageTableCheck = await db.execute(`PRAGMA table_info(t_subscription_usage)`);
    if (usageTableCheck.rows.length > 0) {
      const hasAdminLoginId = usageTableCheck.rows.some(row => row.name === 'admin_login_id');
      if (!hasAdminLoginId) {
        console.log('⚠️  古いスキーマの t_subscription_usage テーブルを検出しました。削除して再作成します...');
        await db.execute('DROP TABLE IF EXISTS t_subscription_usage');
        console.log('✅ 古いテーブルを削除しました');
      }
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_subscription_usage (
        usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_login_id TEXT NOT NULL UNIQUE,
        current_tournament_groups_count INTEGER NOT NULL DEFAULT 0,
        current_tournaments_count INTEGER NOT NULL DEFAULT 0,
        current_storage_usage_mb INTEGER NOT NULL DEFAULT 0,
        last_calculated_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (admin_login_id) REFERENCES m_administrators(admin_login_id) ON DELETE CASCADE
      )
    `);
    console.log('✅ t_subscription_usage テーブルを作成しました\n');

    // ========================================
    // 7. t_tournament_groups に admin_login_id カラムを追加
    // ========================================
    console.log('📋 Step 7: t_tournament_groups テーブルに admin_login_id カラムを追加...');

    const tournamentGroupsInfo = await db.execute(`PRAGMA table_info(t_tournament_groups)`);
    const tournamentGroupsColumns = tournamentGroupsInfo.rows.map(row => row.name);

    if (!tournamentGroupsColumns.includes('admin_login_id')) {
      await db.execute(`
        ALTER TABLE t_tournament_groups ADD COLUMN admin_login_id TEXT
      `);
      console.log('✅ admin_login_id カラムを追加しました');

      // 既存の大会グループに created_by から admin_login_id を設定
      // t_tournaments.created_by を使用して大会グループの作成者を特定
      const groups = await db.execute('SELECT DISTINCT group_id FROM t_tournament_groups WHERE admin_login_id IS NULL');

      for (const group of groups.rows) {
        const groupId = group.group_id;

        // この大会グループに属する部門の created_by を取得
        const createdByResult = await db.execute(
          'SELECT created_by FROM t_tournaments WHERE group_id = ? AND created_by IS NOT NULL LIMIT 1',
          [groupId]
        );

        if (createdByResult.rows.length > 0) {
          const createdBy = createdByResult.rows[0].created_by;
          await db.execute(
            'UPDATE t_tournament_groups SET admin_login_id = ? WHERE group_id = ?',
            [createdBy, groupId]
          );
          console.log(`  ✅ group_id ${groupId} の admin_login_id を ${createdBy} に設定しました`);
        } else {
          // created_by が見つからない場合はデフォルトで 'admin' を設定
          await db.execute(
            'UPDATE t_tournament_groups SET admin_login_id = ? WHERE group_id = ?',
            ['admin', groupId]
          );
          console.log(`  ⚠️  group_id ${groupId} の admin_login_id をデフォルト値 'admin' に設定しました`);
        }
      }
    } else {
      console.log('ℹ️  admin_login_id カラムは既に存在します');
    }
    console.log('');

    // ========================================
    // 8. 既存管理者の使用状況レコード作成
    // ========================================
    console.log('📋 Step 8: 既存管理者の使用状況レコードを作成...');

    const admins = await db.execute('SELECT admin_login_id FROM m_administrators');

    for (const admin of admins.rows) {
      const adminLoginId = admin.admin_login_id;
      console.log(`  処理中: ${adminLoginId}`);

      // 既存チェック
      let existing;
      try {
        existing = await db.execute(
          'SELECT usage_id FROM t_subscription_usage WHERE admin_login_id = ?',
          [adminLoginId]
        );
      } catch (checkError) {
        console.error(`  ❌ 既存チェックエラー (${adminLoginId}):`, checkError.message);
        throw checkError;
      }

      if (existing.rows.length === 0) {
        try {
          // 大会数カウント（アーカイブされていない部門が1つでもある大会）
          const groupsCount = await db.execute(
            `SELECT COUNT(DISTINCT tg.group_id) as count
             FROM t_tournament_groups tg
             WHERE tg.admin_login_id = ?
             AND EXISTS (
               SELECT 1 FROM t_tournaments t
               WHERE t.group_id = tg.group_id
               AND (t.is_archived IS NULL OR t.is_archived = 0)
             )`,
            [adminLoginId]
          );

          // 部門数カウント（アーカイブされていない部門のみ）
          const tournamentsCount = await db.execute(
            `SELECT COUNT(*) as count
             FROM t_tournaments t
             INNER JOIN t_tournament_groups g ON t.group_id = g.group_id
             WHERE g.admin_login_id = ?
             AND (t.is_archived IS NULL OR t.is_archived = 0)`,
            [adminLoginId]
          );

          await db.execute(
            `INSERT INTO t_subscription_usage
             (admin_login_id, current_tournament_groups_count, current_tournaments_count, last_calculated_at)
             VALUES (?, ?, ?, datetime('now', '+9 hours'))`,
            [
              adminLoginId,
              groupsCount.rows[0]?.count || 0,
              tournamentsCount.rows[0]?.count || 0
            ]
          );
          console.log(`  ✅ ${adminLoginId} の使用状況レコードを作成しました`);
        } catch (usageError) {
          console.error(`  ❌ ${adminLoginId} の使用状況レコード作成エラー:`, usageError.message);
          throw usageError;
        }
      } else {
        console.log(`  ℹ️  ${adminLoginId} の使用状況レコードは既に存在します`);
      }
    }
    console.log('');

    // ========================================
    // 9. マイグレーション完了確認
    // ========================================
    console.log('📋 Step 9: マイグレーション結果を確認...');

    const planCountResult = await db.execute('SELECT COUNT(*) as count FROM m_subscription_plans');
    const usageCountResult = await db.execute('SELECT COUNT(*) as count FROM t_subscription_usage');
    const adminCountResult = await db.execute('SELECT COUNT(*) as count FROM m_administrators WHERE current_plan_id IS NOT NULL');

    console.log('');
    console.log('=== マイグレーション結果 ===');
    console.log(`✅ プラン数: ${planCountResult.rows[0]?.count}件`);
    console.log(`✅ 使用状況レコード: ${usageCountResult.rows[0]?.count}件`);
    console.log(`✅ プラン設定済み管理者: ${adminCountResult.rows[0]?.count}件`);
    console.log('');
    console.log('🎉 マイグレーションが正常に完了しました！');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

main();
