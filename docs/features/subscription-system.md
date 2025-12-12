# サブスクリプション・課金機能

[← 実装済み機能一覧に戻る](./implemented-features.md)

## Phase 1: データベース構造整備（✅ 完了）

### 基本概念

管理者ごとに異なる課金プランを設定し、大会作成数や部門数の制限を管理するシステムです。Square決済との連携により、サブスクリプション課金を実現します。

### 基本概念

管理者ごとに異なる課金プランを設定し、大会作成数や部門数の制限を管理するシステムです。Square決済との連携により、サブスクリプション課金を実現します。

### プラン構成

| プラン | 月額料金 | 年額料金 | 大会数上限 | 部門数上限 | チーム数上限 | 機能 |
|--------|----------|----------|------------|------------|------------|------|
| **無料** | ¥0 | ¥0 | 1大会 | 1部門 | 16チーム | 基本機能のみ |
| **ベーシック** | ¥1,980 | ¥19,800 | 1大会 | 1部門 | 32チーム | CSV一括登録 |
| **スタンダード** | ¥4,980 | ¥49,800 | 1大会 | 5部門 | 64チーム | CSV + 高度統計 |
| **プロ** | ¥9,980 | ¥99,800 | 5大会 | 15部門 | 128チーム | 全機能 + カスタムブランディング |
| **プレミアム** | ¥19,800 | ¥198,000 | 10大会 | 30部門 | 256チーム | 全機能 + 優先サポート |

### データベース設計

#### **1. m_subscription_plans（プランマスターテーブル）**

```sql
CREATE TABLE m_subscription_plans (
  plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_name TEXT NOT NULL,                    -- プラン名
  plan_code TEXT UNIQUE NOT NULL,             -- プランコード（free, basic, standard, pro, premium）
  plan_description TEXT,                      -- プラン説明
  monthly_price INTEGER NOT NULL,             -- 月額料金（円）
  yearly_price INTEGER,                       -- 年額料金（円）
  currency TEXT DEFAULT 'JPY',
  max_tournaments INTEGER NOT NULL,           -- 大会数上限
  max_divisions_per_tournament INTEGER,       -- 1大会あたりの部門数上限
  total_max_divisions INTEGER,                -- 全大会通算の部門数上限
  max_teams_per_tournament INTEGER,           -- 1大会あたりのチーム数上限
  allow_csv_import INTEGER DEFAULT 0,         -- CSV一括登録機能
  allow_advanced_stats INTEGER DEFAULT 0,     -- 高度な統計機能
  allow_custom_branding INTEGER DEFAULT 0,    -- カスタムブランディング
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  is_visible INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours'))
);
```

#### **2. t_administrator_subscriptions（サブスクリプション情報テーブル）**

```sql
CREATE TABLE t_administrator_subscriptions (
  subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
  administrator_id TEXT NOT NULL,
  plan_id INTEGER NOT NULL,
  subscription_status TEXT DEFAULT 'active',  -- trial, active, suspended, cancelled, expired
  start_date TEXT NOT NULL,
  end_date TEXT,
  trial_end_date TEXT,
  next_billing_date TEXT,
  billing_cycle TEXT DEFAULT 'monthly',       -- monthly, yearly
  auto_renew INTEGER DEFAULT 1,
  square_subscription_id TEXT,                -- Square側のサブスクリプションID
  square_customer_id TEXT,                    -- Square側の顧客ID
  square_location_id TEXT,
  cancelled_at TEXT,
  cancelled_reason TEXT,
  cancelled_by TEXT,                          -- user, admin, system
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (administrator_id) REFERENCES m_administrators(administrator_id),
  FOREIGN KEY (plan_id) REFERENCES m_subscription_plans(plan_id)
);
```

#### **3. t_subscription_usage（使用状況追跡テーブル）**

```sql
CREATE TABLE t_subscription_usage (
  usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
  administrator_id TEXT NOT NULL,
  subscription_id INTEGER,
  current_tournaments_count INTEGER DEFAULT 0,    -- 現在の大会数
  current_divisions_count INTEGER DEFAULT 0,      -- 現在の部門数
  current_total_teams_count INTEGER DEFAULT 0,    -- 総チーム数
  total_tournaments_created INTEGER DEFAULT 0,    -- 累計作成大会数
  total_matches_conducted INTEGER DEFAULT 0,      -- 累計試合実施数
  last_calculated_at TEXT,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (administrator_id) REFERENCES m_administrators(administrator_id),
  FOREIGN KEY (subscription_id) REFERENCES t_administrator_subscriptions(subscription_id)
);
```

#### **4. t_payment_history（支払い履歴テーブル）**

```sql
CREATE TABLE t_payment_history (
  payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  administrator_id TEXT NOT NULL,
  plan_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  tax_amount INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'JPY',
  payment_status TEXT DEFAULT 'pending',      -- pending, completed, failed, refunded, disputed
  payment_method TEXT,
  square_payment_id TEXT,
  square_order_id TEXT,
  square_receipt_url TEXT,
  paid_at TEXT,
  refunded_at TEXT,
  refund_amount INTEGER,
  refund_reason TEXT,
  billing_period_start TEXT,
  billing_period_end TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (subscription_id) REFERENCES t_administrator_subscriptions(subscription_id),
  FOREIGN KEY (administrator_id) REFERENCES m_administrators(administrator_id),
  FOREIGN KEY (plan_id) REFERENCES m_subscription_plans(plan_id)
);
```

#### **5. m_administrators テーブル拡張**

```sql
ALTER TABLE m_administrators ADD COLUMN current_plan_id INTEGER REFERENCES m_subscription_plans(plan_id);
ALTER TABLE m_administrators ADD COLUMN subscription_status TEXT DEFAULT 'free';
ALTER TABLE m_administrators ADD COLUMN trial_start_date TEXT;
ALTER TABLE m_administrators ADD COLUMN trial_end_date TEXT;
ALTER TABLE m_administrators ADD COLUMN square_customer_id TEXT;
```

### 部門の扱い方

同一大会内で複数部門（一般の部、小学生の部など）を管理する機能は、**既存のアーキテクチャ（t_tournament_groups + t_tournaments）で実現されています**。

**既存の実装方針**:
- **t_tournament_groups**: 大会（イベント）全体を表す親テーブル
  - 例: "第1回PK大会"
- **t_tournaments**: 各部門を個別のレコードとして管理
  - `group_id`: 所属する大会グループのID（t_tournament_groups.group_id）
  - `group_order`: 大会グループ内での部門の順序
  - `tournament_name`: 部門名そのもの（例: "一般の部"、"小学生の部"）

```typescript
// 例: 第1回PK大会（一般の部 + 小学生の部）
// t_tournament_groups
group_id: 1, group_name: "第1回PK大会"

// t_tournaments
tournament_id: 101, tournament_name: "一般の部", group_id: 1, group_order: 1
tournament_id: 102, tournament_name: "小学生の部", group_id: 1, group_order: 2
```

**サブスクリプションプランでの部門数制限**:
- `max_divisions_per_tournament`: `group_id`が同一の`t_tournaments`レコード数を制限
- `total_max_divisions`: 全大会通算の`t_tournaments`レコード数を制限

### 段階的実装プラン

#### **Phase 1: データベース構造整備（✅ 完了）**
- サブスクリプション関連テーブルの作成
- プランマスターデータの投入
- 既存管理者の無料プランへの自動割り当て

**実装状況**:
- `scripts/add-subscription-tables.sql`: テーブル定義
- `scripts/migrate-add-subscription.js`: マイグレーションスクリプト
- 5つのプラン（無料、ベーシック、スタンダード、プロ、プレミアム）設定完了
- 既存3名の管理者を無料プランに自動割り当て完了

#### **Phase 2: プラン情報表示機能（未実装）**
- 管理者ダッシュボードに現在のプラン・使用状況を表示
- プラン比較ページの作成
- 使用状況の自動計算機能

#### **Phase 3: プラン制限チェック（未実装）**
```typescript
// lib/subscription-checker.ts（予定）
async function canCreateTournament(administratorId: string): Promise<boolean> {
  const usage = await getCurrentUsage(administratorId);
  const plan = await getCurrentPlan(administratorId);
  return usage.current_tournaments_count < plan.max_tournaments;
}
```

#### **Phase 4: Square連携（未実装）**
- Square SDK統合
- サブスクリプション登録API
- Webhook処理（支払い成功・失敗・キャンセル）
- 自動更新処理

#### **Phase 5: サブスクリプション管理UI（未実装）**
- プランアップグレード/ダウングレード
- 支払い履歴表示
- 領収書発行
- キャンセル処理

### 使用状況の更新タイミング

```typescript
// 大会作成時
await createTournament(data);
await incrementUsageCount(administratorId, 'tournaments');

// 大会削除時
await deleteTournament(tournamentId);
await decrementUsageCount(administratorId, 'tournaments');

// 定期的な再計算（整合性チェック）
async function recalculateUsage(administratorId: string) {
  const count = await db.execute(`
    SELECT COUNT(*) as cnt FROM t_tournaments
    WHERE created_by = ? AND status != 'deleted'
  `, [administratorId]);

  await db.execute(`
    UPDATE t_subscription_usage
    SET current_tournaments_count = ?,
        last_calculated_at = datetime('now', '+9 hours')
    WHERE administrator_id = ?
  `, [count.rows[0].cnt, administratorId]);
}
```

### 実装完了状況

- ✅ **データベース設計**: 4つの新規テーブル + 2つのテーブル拡張
- ✅ **マイグレーションスクリプト**: 自動実行可能
- ✅ **プランマスターデータ**: 5プラン投入済み
- ✅ **既存データ移行**: 既存管理者を無料プランに割り当て済み
- ⏳ **API実装**: 未着手（Phase 2以降）
- ⏳ **UI実装**: 未着手（Phase 2以降）
- ⏳ **Square連携**: 未着手（Phase 4）

**現状**: Phase 1完了。今後の実装に向けたデータベース基盤が整備された状態です。
