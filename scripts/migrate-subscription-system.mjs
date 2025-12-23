// サブスクリプションシステム - データベースマイグレーション
// 既存の不整合テーブルを削除し、正しいスキーマで再作成
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function migrateSubscriptionSystem() {
  console.log('=== サブスクリプションシステム マイグレーション開始 ===\n');

  try {
    // 1. 既存の不整合テーブルを削除
    console.log('1. 既存テーブルのクリーンアップ中...');

    await db.execute(`DROP TABLE IF EXISTS t_payment_history`);
    console.log('  ✓ t_payment_history 削除');

    await db.execute(`DROP TABLE IF EXISTS t_subscription_usage`);
    console.log('  ✓ t_subscription_usage 削除');

    await db.execute(`DROP TABLE IF EXISTS t_administrator_subscriptions`);
    console.log('  ✓ t_administrator_subscriptions 削除');

    console.log('');

    // 2. プランマスターテーブル確認・作成
    console.log('2. m_subscription_plans テーブル確認中...');

    const existingPlans = await db.execute(`SELECT * FROM m_subscription_plans ORDER BY plan_id`);
    console.log(`  既存プラン数: ${existingPlans.rows.length}`);

    if (existingPlans.rows.length === 0) {
      console.log('  プランデータを投入中...');
      await db.execute(`
        INSERT INTO m_subscription_plans
        (plan_name, plan_code, plan_description, monthly_price, yearly_price, max_tournaments, max_divisions_per_tournament, display_order)
        VALUES
        ('無料プラン', 'free', '1年間の無料トライアル。制限なしで全機能を利用可能', 0, 0, -1, -1, 1),
        ('ベーシック', 'basic', '小規模大会向け。1大会・1部門まで対応', 1980, 19800, 1, 1, 2),
        ('スタンダード', 'standard', '中規模大会向け。複数部門運営が可能', 4980, 49800, 1, 5, 3),
        ('プロ', 'pro', '複数大会の同時運営に対応', 9980, 99800, 5, 15, 4),
        ('プレミアム', 'premium', '大規模運営向け。最大の柔軟性を提供', 19800, 198000, 10, 30, 5)
      `);
      console.log('  ✓ 5プラン投入完了');
    } else {
      // 既存プランの max_tournaments, max_divisions_per_tournament を更新
      console.log('  既存プランを更新中...');
      const updates = [
        { code: 'free', max_tournaments: -1, max_divisions: -1 },
        { code: 'basic', max_tournaments: 1, max_divisions: 1 },
        { code: 'standard', max_tournaments: 1, max_divisions: 5 },
        { code: 'pro', max_tournaments: 5, max_divisions: 15 },
        { code: 'premium', max_tournaments: 10, max_divisions: 30 },
      ];

      for (const update of updates) {
        await db.execute(
          `UPDATE m_subscription_plans
           SET max_tournaments = ?, max_divisions_per_tournament = ?
           WHERE plan_code = ?`,
          [update.max_tournaments, update.max_divisions, update.code]
        );
      }
      console.log('  ✓ プラン制限値更新完了');
    }
    console.log('');

    // 3. 新しいテーブル作成（admin_login_idを参照）
    console.log('3. サブスクリプションテーブル作成中...');

    // t_administrator_subscriptions
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_administrator_subscriptions (
        subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_login_id TEXT NOT NULL,
        plan_id INTEGER NOT NULL,
        subscription_status TEXT DEFAULT 'active',
        start_date TEXT NOT NULL,
        end_date TEXT,
        trial_end_date TEXT,
        changed_from_plan_id INTEGER,
        change_reason TEXT,
        created_at TEXT DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (admin_login_id) REFERENCES m_administrators(admin_login_id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES m_subscription_plans(plan_id)
      )
    `);
    console.log('  ✓ t_administrator_subscriptions 作成');

    // t_subscription_usage
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_subscription_usage (
        usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_login_id TEXT NOT NULL UNIQUE,
        current_tournament_groups_count INTEGER DEFAULT 0,
        current_tournaments_count INTEGER DEFAULT 0,
        last_calculated_at TEXT,
        created_at TEXT DEFAULT (datetime('now', '+9 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (admin_login_id) REFERENCES m_administrators(admin_login_id) ON DELETE CASCADE
      )
    `);
    console.log('  ✓ t_subscription_usage 作成');

    // t_payment_history（将来用）
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_payment_history (
        payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL,
        admin_login_id TEXT NOT NULL,
        plan_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        payment_status TEXT DEFAULT 'pending',
        square_payment_id TEXT,
        paid_at TEXT,
        created_at TEXT DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (admin_login_id) REFERENCES m_administrators(admin_login_id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES m_subscription_plans(plan_id)
      )
    `);
    console.log('  ✓ t_payment_history 作成');
    console.log('');

    // 4. m_administrators テーブル拡張
    console.log('4. m_administrators テーブル拡張中...');

    const tableInfo = await db.execute(`PRAGMA table_info(m_administrators)`);
    const columnNames = tableInfo.rows.map(row => row.name);

    if (!columnNames.includes('current_plan_id')) {
      await db.execute(`ALTER TABLE m_administrators ADD COLUMN current_plan_id INTEGER DEFAULT 1`);
      console.log('  ✓ current_plan_id カラム追加');
    } else {
      console.log('  - current_plan_id カラムは既に存在');
    }

    if (!columnNames.includes('free_trial_end_date')) {
      await db.execute(`ALTER TABLE m_administrators ADD COLUMN free_trial_end_date TEXT`);
      console.log('  ✓ free_trial_end_date カラム追加');
    } else {
      console.log('  - free_trial_end_date カラムは既に存在');
    }

    if (!columnNames.includes('plan_changed_at')) {
      await db.execute(`ALTER TABLE m_administrators ADD COLUMN plan_changed_at TEXT`);
      console.log('  ✓ plan_changed_at カラム追加');
    } else {
      console.log('  - plan_changed_at カラムは既に存在');
    }
    console.log('');

    // 5. 既存管理者への無料プラン設定
    console.log('5. 既存管理者データ設定中...');

    const admins = await db.execute(`SELECT admin_login_id, created_at, current_plan_id, free_trial_end_date FROM m_administrators`);
    console.log(`  対象管理者: ${admins.rows.length}名`);

    for (const admin of admins.rows) {
      // current_plan_idが未設定またはNULLの場合、無料プランに設定
      if (!admin.current_plan_id || admin.current_plan_id === 0) {
        const trialEndDate = new Date(admin.created_at);
        trialEndDate.setFullYear(trialEndDate.getFullYear() + 1);
        const trialEndStr = trialEndDate.toISOString().split('T')[0]; // YYYY-MM-DD形式

        await db.execute(
          `UPDATE m_administrators
           SET current_plan_id = 1,
               free_trial_end_date = ?
           WHERE admin_login_id = ?`,
          [trialEndStr, admin.admin_login_id]
        );
        console.log(`  ✓ ${admin.admin_login_id}: 無料プラン設定 (期限: ${trialEndStr})`);
      } else {
        console.log(`  - ${admin.admin_login_id}: 既にプラン設定済み (plan_id: ${admin.current_plan_id})`);
      }
    }
    console.log('');

    // 6. 使用状況テーブル初期化
    console.log('6. 使用状況テーブル初期化中...');

    for (const admin of admins.rows) {
      await db.execute(
        `INSERT INTO t_subscription_usage (admin_login_id, current_tournament_groups_count, current_tournaments_count)
         VALUES (?, 0, 0)`,
        [admin.admin_login_id]
      );
      console.log(`  ✓ ${admin.admin_login_id}: 使用状況レコード作成`);
    }
    console.log('');

    // 7. サブスクリプション履歴初期化
    console.log('7. サブスクリプション履歴初期化中...');

    // 管理者データを再取得（free_trial_end_dateが設定された状態）
    const adminsUpdated = await db.execute(`SELECT admin_login_id, created_at, free_trial_end_date FROM m_administrators`);

    for (const admin of adminsUpdated.rows) {
      await db.execute(
        `INSERT INTO t_administrator_subscriptions
         (admin_login_id, plan_id, subscription_status, start_date, trial_end_date)
         VALUES (?, 1, 'active', ?, ?)`,
        [admin.admin_login_id, admin.created_at, admin.free_trial_end_date]
      );
      console.log(`  ✓ ${admin.admin_login_id}: サブスクリプション履歴作成`);
    }
    console.log('');

    // 8. インデックス作成
    console.log('8. インデックス作成中...');
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_subscription_admin ON t_administrator_subscriptions(admin_login_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_subscription_status ON t_administrator_subscriptions(subscription_status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_usage_admin ON t_subscription_usage(admin_login_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_payment_admin ON t_payment_history(admin_login_id)`);
    console.log('  ✓ インデックス作成完了');
    console.log('');

    // 9. 最終確認
    console.log('9. マイグレーション結果確認...');
    const finalPlanCount = await db.execute(`SELECT COUNT(*) as count FROM m_subscription_plans`);
    const finalAdminCount = await db.execute(`SELECT COUNT(*) as count FROM m_administrators WHERE current_plan_id IS NOT NULL`);
    const finalUsageCount = await db.execute(`SELECT COUNT(*) as count FROM t_subscription_usage`);
    const finalSubCount = await db.execute(`SELECT COUNT(*) as count FROM t_administrator_subscriptions`);

    console.log(`  プラン数: ${finalPlanCount.rows[0].count}`);
    console.log(`  プラン設定済み管理者数: ${finalAdminCount.rows[0].count}`);
    console.log(`  使用状況レコード数: ${finalUsageCount.rows[0].count}`);
    console.log(`  サブスクリプション履歴数: ${finalSubCount.rows[0].count}`);
    console.log('');

    console.log('=== マイグレーション完了 ===\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

migrateSubscriptionSystem();
