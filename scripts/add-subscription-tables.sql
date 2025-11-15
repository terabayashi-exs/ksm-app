-- ========================================
-- サブスクリプション・課金機能テーブル追加スクリプト
-- 実行日: 2025-01-XX
-- ========================================

-- 1. プランマスターテーブル
CREATE TABLE IF NOT EXISTS m_subscription_plans (
  plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_name TEXT NOT NULL,
  plan_code TEXT UNIQUE NOT NULL,
  plan_description TEXT,

  -- 料金情報
  monthly_price INTEGER NOT NULL,
  yearly_price INTEGER,
  currency TEXT DEFAULT 'JPY',

  -- 制限情報
  max_tournaments INTEGER NOT NULL,
  max_divisions_per_tournament INTEGER,
  total_max_divisions INTEGER,
  max_teams_per_tournament INTEGER,

  -- 機能制限
  allow_csv_import INTEGER DEFAULT 0,
  allow_advanced_stats INTEGER DEFAULT 0,
  allow_custom_branding INTEGER DEFAULT 0,

  -- 表示・管理
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  is_visible INTEGER DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours'))
);

-- 2. サブスクリプション情報テーブル
CREATE TABLE IF NOT EXISTS t_administrator_subscriptions (
  subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
  administrator_id TEXT NOT NULL,
  plan_id INTEGER NOT NULL,

  -- サブスクリプション状態
  subscription_status TEXT DEFAULT 'active',

  -- 期間情報
  start_date TEXT NOT NULL,
  end_date TEXT,
  trial_end_date TEXT,
  next_billing_date TEXT,

  -- 請求情報
  billing_cycle TEXT DEFAULT 'monthly',
  auto_renew INTEGER DEFAULT 1,

  -- Square連携情報
  square_subscription_id TEXT,
  square_customer_id TEXT,
  square_location_id TEXT,

  -- キャンセル情報
  cancelled_at TEXT,
  cancelled_reason TEXT,
  cancelled_by TEXT,

  -- メタ情報
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours')),

  FOREIGN KEY (administrator_id) REFERENCES m_administrators(administrator_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES m_subscription_plans(plan_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_subscriptions_admin ON t_administrator_subscriptions(administrator_id);
CREATE INDEX IF NOT EXISTS idx_admin_subscriptions_status ON t_administrator_subscriptions(subscription_status);
CREATE INDEX IF NOT EXISTS idx_admin_subscriptions_square ON t_administrator_subscriptions(square_subscription_id);

-- 3. 使用状況追跡テーブル
CREATE TABLE IF NOT EXISTS t_subscription_usage (
  usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
  administrator_id TEXT NOT NULL,
  subscription_id INTEGER,

  -- 使用状況カウント
  current_tournaments_count INTEGER DEFAULT 0,
  current_divisions_count INTEGER DEFAULT 0,
  current_total_teams_count INTEGER DEFAULT 0,

  -- 累積統計
  total_tournaments_created INTEGER DEFAULT 0,
  total_matches_conducted INTEGER DEFAULT 0,

  -- 更新情報
  last_calculated_at TEXT,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours')),

  FOREIGN KEY (administrator_id) REFERENCES m_administrators(administrator_id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES t_administrator_subscriptions(subscription_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_admin ON t_subscription_usage(administrator_id);

-- 4. 支払い履歴テーブル
CREATE TABLE IF NOT EXISTS t_payment_history (
  payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  administrator_id TEXT NOT NULL,
  plan_id INTEGER NOT NULL,

  -- 支払い情報
  amount INTEGER NOT NULL,
  tax_amount INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'JPY',

  -- 支払い状態
  payment_status TEXT DEFAULT 'pending',
  payment_method TEXT,

  -- Square連携情報
  square_payment_id TEXT,
  square_order_id TEXT,
  square_receipt_url TEXT,

  -- 日時情報
  paid_at TEXT,
  refunded_at TEXT,
  refund_amount INTEGER,
  refund_reason TEXT,

  -- 請求期間
  billing_period_start TEXT,
  billing_period_end TEXT,

  -- メタ情報
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours')),

  FOREIGN KEY (subscription_id) REFERENCES t_administrator_subscriptions(subscription_id),
  FOREIGN KEY (administrator_id) REFERENCES m_administrators(administrator_id),
  FOREIGN KEY (plan_id) REFERENCES m_subscription_plans(plan_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_admin ON t_payment_history(administrator_id);
CREATE INDEX IF NOT EXISTS idx_payment_status ON t_payment_history(payment_status);
CREATE INDEX IF NOT EXISTS idx_payment_square ON t_payment_history(square_payment_id);

-- 5. 既存テーブルへのフィールド追加: m_administrators
ALTER TABLE m_administrators ADD COLUMN current_plan_id INTEGER REFERENCES m_subscription_plans(plan_id);
ALTER TABLE m_administrators ADD COLUMN subscription_status TEXT DEFAULT 'free';
ALTER TABLE m_administrators ADD COLUMN trial_start_date TEXT;
ALTER TABLE m_administrators ADD COLUMN trial_end_date TEXT;
ALTER TABLE m_administrators ADD COLUMN square_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_plan ON m_administrators(current_plan_id);
CREATE INDEX IF NOT EXISTS idx_admin_sub_status ON m_administrators(subscription_status);

-- ========================================
-- 【注意】以下のt_tournaments拡張は削除されました
-- ========================================
-- 理由: 既存のアーキテクチャ（t_tournament_groups + group_id）で部門機能は実現済み
-- - t_tournament_groups: 大会（イベント）全体を管理
-- - t_tournaments.group_id: 所属する大会グループID
-- - t_tournaments.group_order: 大会グループ内での部門順序
-- - t_tournaments.tournament_name: 部門名そのもの
--
-- 以下のフィールドは冗長なため、ロールバックスクリプトで削除済み:
-- ALTER TABLE t_tournaments ADD COLUMN division_name TEXT;           -- ← tournament_nameと重複
-- ALTER TABLE t_tournaments ADD COLUMN division_code TEXT;           -- ← 不要
-- ALTER TABLE t_tournaments ADD COLUMN division_order INTEGER;        -- ← group_orderと重複
-- ALTER TABLE t_tournaments ADD COLUMN parent_tournament_id INTEGER; -- ← group_idと重複
-- ALTER TABLE t_tournaments ADD COLUMN is_division INTEGER;          -- ← 全てのt_tournamentsが部門
--
-- ロールバック実行: scripts/rollback-redundant-fields.js
-- ========================================

-- ========================================
-- 初期データ投入
-- ========================================

-- プランマスターデータ
INSERT INTO m_subscription_plans (
  plan_code, plan_name, plan_description,
  monthly_price, yearly_price,
  max_tournaments, max_divisions_per_tournament, total_max_divisions,
  max_teams_per_tournament,
  allow_csv_import, allow_advanced_stats, allow_custom_branding,
  display_order, is_active, is_visible
) VALUES
-- 無料プラン
(
  'free', '無料プラン', '個人利用や小規模大会向けの無料プラン',
  0, 0,
  1, 1, 1,
  16,
  0, 0, 0,
  1, 1, 1
),
-- ベーシックプラン
(
  'basic', 'ベーシック', '小規模大会運営に最適なエントリープラン',
  1980, 19800,
  1, 1, 1,
  32,
  1, 0, 0,
  2, 1, 1
),
-- スタンダードプラン
(
  'standard', 'スタンダード', '複数部門を持つ大会運営に対応',
  4980, 49800,
  1, 5, 5,
  64,
  1, 1, 0,
  3, 1, 1
),
-- プロプラン
(
  'pro', 'プロ', '複数大会を運営する組織向けプラン',
  9980, 99800,
  5, 3, 15,
  128,
  1, 1, 1,
  4, 1, 1
),
-- プレミアムプラン
(
  'premium', 'プレミアム', '大規模大会運営や複数大会同時開催向け',
  19800, 198000,
  10, 3, 30,
  256,
  1, 1, 1,
  5, 1, 1
);

-- ========================================
-- 既存管理者の無料プランへの自動割り当て
-- ========================================

-- 既存管理者に無料プランを割り当て
UPDATE m_administrators
SET
  current_plan_id = (SELECT plan_id FROM m_subscription_plans WHERE plan_code = 'free'),
  subscription_status = 'free'
WHERE current_plan_id IS NULL;

-- 既存管理者のサブスクリプションレコード作成
INSERT INTO t_administrator_subscriptions (
  administrator_id,
  plan_id,
  subscription_status,
  start_date,
  billing_cycle,
  auto_renew
)
SELECT
  administrator_id,
  (SELECT plan_id FROM m_subscription_plans WHERE plan_code = 'free'),
  'active',
  datetime('now', '+9 hours'),
  'monthly',
  0
FROM m_administrators
WHERE administrator_id NOT IN (SELECT administrator_id FROM t_administrator_subscriptions);

-- 既存管理者の使用状況レコード作成
INSERT INTO t_subscription_usage (
  administrator_id,
  subscription_id,
  current_tournaments_count,
  current_divisions_count,
  last_calculated_at
)
SELECT
  a.administrator_id,
  s.subscription_id,
  COALESCE((
    SELECT COUNT(*)
    FROM t_tournaments
    WHERE created_by = a.administrator_id
    AND status != 'cancelled'
  ), 0),
  COALESCE((
    SELECT COUNT(*)
    FROM t_tournaments
    WHERE created_by = a.administrator_id
    AND status != 'cancelled'
    AND is_division = 1
  ), 0),
  datetime('now', '+9 hours')
FROM m_administrators a
LEFT JOIN t_administrator_subscriptions s ON a.administrator_id = s.administrator_id
WHERE a.administrator_id NOT IN (SELECT administrator_id FROM t_subscription_usage);

-- ========================================
-- 完了メッセージ
-- ========================================
SELECT 'サブスクリプション関連テーブルの作成が完了しました。' as message;
SELECT COUNT(*) as total_plans FROM m_subscription_plans;
SELECT COUNT(*) as total_subscriptions FROM t_administrator_subscriptions;
SELECT COUNT(*) as total_usage_records FROM t_subscription_usage;
