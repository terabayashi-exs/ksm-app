# データベース設計仕様書

このドキュメントでは、KSM-Appプロジェクトのデータベース設計について詳述します。

> **最終更新**: 2026年2月5日
> **重要な変更**: `team_id` → `tournament_team_id` 移行完了（複数エントリーチーム対応）

## 📊 データベース設計概要

データベース設計は[./database/KSM.md](../database/KSM.md)に詳細なER図（Mermaid記法）で定義されています。

### 主要テーブル構成

#### マスタテーブル (9テーブル)
- `m_venues` - 会場マスター
- `m_teams` - チームマスター
- `m_players` - 選手マスター
- `m_administrators` - 管理者マスター
- `m_tournament_formats` - 大会フォーマットマスター
- `m_match_templates` - 試合テンプレートマスター
- `m_subscription_plans` - サブスクリプションプランマスター
- `m_sport_types` - 競技種別マスター（PK戦、ハンドボール等）
- `m_tournament_groups` - 大会グループマスター（大会分類用）

#### トランザクションテーブル (23テーブル)
- `t_tournaments` - 大会情報
- `t_tournament_teams` - 大会参加チーム（UNIQUE制約削除: 2026-01-08）
- `t_tournament_players` - 大会参加選手
- `t_match_blocks` - 試合ブロック（予選グループ、決勝トーナメントなど）
- `t_matches_live` - 進行中試合情報
- `t_matches_final` - 確定済み試合結果
- `t_match_status` - 試合状態管理
- `t_tournament_rules` - 大会ルール設定
- `t_tournament_courts` - 大会コート情報
- `t_tournament_files` - 大会関連ファイル（Blob Storage連携）
- `t_tournament_groups` - 大会グループ
- `t_tournament_match_overrides` - 試合進出条件オーバーライド
- `t_tournament_notifications` - 大会通知情報
- `t_email_send_history` - メール送信履歴
- `t_email_verification_tokens` - メール認証トークン
- `t_password_reset_tokens` - パスワードリセットトークン
- `t_administrator_subscriptions` - 管理者サブスクリプション
- `t_subscription_usage` - サブスクリプション使用状況
- `t_payment_history` - 決済履歴
- `t_archived_tournament_json` - アーカイブ済み大会データ（JSON形式）
- `t_announcements` - お知らせ情報（新規追加: 2026-01-08）
- `t_sponsor_banners` - スポンサーバナー管理（新規追加: 2026-01-13）
- `sqlite_sequence` - SQLite内部シーケンステーブル

詳細な設計については[../database/KSM.md](../database/KSM.md)を参照してください。

### 複数エントリーチーム対応（tournament_team_id移行完了）

**移行完了日**: 2026年2月5日

同一マスターチームが複数のエントリーで大会に参加できるよう、データベース設計とアプリケーションロジックを変更しました。

#### **主な変更点**

1. **主キーの変更**
   - 旧: `team_id` (マスターチームID) を試合やランキングの識別に使用
   - 新: `tournament_team_id` (大会参加エントリーID) を主キーとして使用
   - 後方互換性: `team_id` フィールドは保持（マスターチームとの関連維持）

2. **影響を受けるテーブル**
   - `t_matches_live`: `team1_tournament_team_id`, `team2_tournament_team_id` を使用
   - `t_matches_final`: `winner_tournament_team_id` を追加
   - `t_match_blocks`: `team_rankings` JSON内で `tournament_team_id` を使用

3. **移行したファイル（20ファイル）**
   - 試合結果処理: `lib/match-results-calculator.ts`, `lib/match-result-handler.ts`
   - 順位表計算: `lib/standings-calculator.ts`, `lib/sport-standings-calculator.ts`
   - トーナメント進行: `lib/tournament-progression.ts`, `lib/tournament-promotion.ts`
   - 辞退処理: `lib/withdrawal-processor.ts`
   - API層: `app/api/matches/[id]/confirm/route.ts`, `app/api/tournaments/[id]/matches/route.ts` など

4. **データ取得の優先順位**
   - 第1優先: `tournament_team_id` ベースの処理
   - フォールバック: `team_id` ベースの処理（古いデータとの互換性）

#### **実装の注意点**

- SQL WHERE句: `team1_id IS NOT NULL` → `team1_tournament_team_id IS NOT NULL`
- JOIN: `t_tournament_teams` を使用してチーム名を解決
- 勝者判定: `winner_tournament_team_id` を優先、`winner_team_id` はフォールバック

### スコアシステムの拡張（複数ピリオド対応）

従来の単一スコア方式（`team1_goals`, `team2_goals`）から、複数ピリオド対応のスコア方式に変更されました。

#### **変更内容**
- **旧方式**: `team1_goals INTEGER`, `team2_goals INTEGER`（単一整数値）
- **新方式**: `team1_scores TEXT`, `team2_scores TEXT`（JSON配列形式）

#### **データフォーマット仕様** ⚠️ 重要
スコアデータは**必ずJSON配列形式**で保存します。

```json
// ✅ 正しい形式（JSON配列）
"[3, 2, 1]"  // 前半3点、後半2点、延長1点
"[2, 2]"     // 前半2点、後半2点
"[5]"        // 単一ピリオド5点

// ❌ 非推奨形式（レガシー互換性のため読み取りのみ対応）
"3,2,1"      // カンマ区切り形式（古い実装）
"5"          // 単一数値形式（古い実装）
```

#### **スコアデータの読み書き**

**書き込み（保存時）**: 必ず `formatScoreArray()` を使用
```typescript
import { formatScoreArray } from '@/lib/score-parser';

const scores = [3, 2, 1];
const scoreData = formatScoreArray(scores);  // "[3,2,1]"
```

**読み取り（表示時）**: 必ず `parseScoreArray()` または `parseTotalScore()` を使用
```typescript
import { parseScoreArray, parseTotalScore } from '@/lib/score-parser';

// 配列として取得（ピリオド別表示が必要な場合）
const scores = parseScoreArray(scoreData);  // [3, 2, 1]

// 合計値のみ取得（順位表などで使用）
const total = parseTotalScore(scoreData);   // 6
```

⚠️ **注意**: `split(',')` や `includes(',')` を直接使用しないでください。全形式に対応した `score-parser.ts` のヘルパー関数を必ず使用してください。

#### **PK戦の特殊処理**

サッカー等の競技でPK戦がある場合、通常時間とPK戦のスコアは**独立して扱います**。

```typescript
// サッカー: 前半1点、後半1点、延長0点、PK戦5点
const scores = [1, 1, 0, 5];

// 通常時間の合計（順位表計算に使用）
const regularGoals = scores.slice(0, 3).reduce((sum, s) => sum + s, 0);  // 2

// PK戦のスコア（表示のみ）
const pkGoals = scores[3];  // 5

// 表示: "2 - 1 (PK 5-4)"
```

#### **対応競技**
- **PK戦**: 1ピリオド制（通常）
- **フットサル**: 2ピリオド制（前半・後半）
- **ハンドボール**: 2ピリオド制（前半・後半）+ 延長・PK対応
- **サッカー**: 2ピリオド制（前半・後半）+ 延長・PK対応
- **バスケットボール**: 4ピリオド制（1Q・2Q・3Q・4Q）+ 延長対応

#### **適用テーブル**
- `t_matches_live`: 進行中試合のスコア記録
- `t_matches_final`: 確定済み試合結果のスコア保存

#### **データ移行履歴**
- **2025-12-12**: 全スコアデータをJSON配列形式に統一（287レコード移行完了）
- 移行前の形式（カンマ区切り、単一数値）からの読み取りは後方互換性のため維持

### 柔軟な試合進出条件システム（t_tournament_match_overrides）

チーム辞退等により予定と異なる進出条件が必要になった場合、大会別に試合の進出元チームをオーバーライドできるシステムです。

#### **データ構造**
```sql
CREATE TABLE t_tournament_match_overrides (
  override_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  match_code TEXT NOT NULL,                    -- 'M1', 'T1'など
  team1_source_override TEXT,                  -- 元の条件を上書き（例: 'A_3' → 'B_4'）
  team2_source_override TEXT,
  override_reason TEXT,                        -- 変更理由
  overridden_by TEXT,                          -- 変更実施者
  overridden_at TEXT DEFAULT (datetime('now', '+9 hours')),
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(tournament_id, match_code),
  FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE
);
```

#### **使用パターン**
```sql
-- 例: Aブロック2チーム辞退により、M1試合（Aブロック3位 vs Bブロック4位）を調整
-- 元々: A_3 vs B_4
-- 変更後: B_4 vs C_4（Aブロック3位チームが存在しないため）

INSERT INTO t_tournament_match_overrides
  (tournament_id, match_code, team1_source_override, override_reason, overridden_by)
VALUES
  (9, 'M1', 'B_4', 'Aブロック2チーム辞退により進出チーム不足', 'admin@example.com');
```

#### **適用ロジック（COALESCE パターン）**
```sql
-- 試合進出元チーム取得時にオーバーライドを優先適用
SELECT
  COALESCE(override.team1_source_override, template.team1_source) as team1_source,
  COALESCE(override.team2_source_override, template.team2_source) as team2_source
FROM m_match_templates template
LEFT JOIN t_tournament_match_overrides override
  ON template.format_id = ?
  AND template.match_code = override.match_code
  AND override.tournament_id = ?
WHERE template.match_code = ?;
```

#### **運用メリット**
- **柔軟性**: テンプレート変更なしで大会別に条件調整
- **トレーサビリティ**: 変更理由・実施者を記録
- **安全性**: NULL時はデフォルト条件を使用（既存動作を破壊しない）
- **保守性**: 大会終了後もオーバーライド履歴が残る

### Tursoでのトランザクション制限

Turso（リモートSQLite）を使用する際の重要な制限事項：

#### **制限内容**
- 従来のSQLiteトランザクション構文（`BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK`）がサポートされていない
- リモートデータベースの性質上、トランザクション処理に制約がある

#### **対処法**
1. **トランザクションを使用しない設計**
   ```typescript
   // ❌ 動作しない (Tursoでエラーが発生)
   await db.execute('BEGIN TRANSACTION');
   // ... 処理 ...
   await db.execute('COMMIT');
   
   // ✅ 推奨される方法
   try {
     // 個別のUPDATE/INSERTを順次実行
     await db.execute('UPDATE ...');
     await db.execute('INSERT ...');
   } catch (error) {
     // エラーハンドリング
   }
   ```

2. **処理順序の工夫**
   - データ整合性を保つため、処理順序を慎重に設計
   - 削除→挿入/更新の順序でデータの不整合を最小化

3. **エラーハンドリング**
   - トランザクションによるロールバックができないため、エラー発生時の復旧処理を個別に実装
   - 部分的な処理失敗を想定した設計

#### **実装例（組合せ保存処理）**
```typescript
// app/api/tournaments/[id]/draw/route.ts
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // 1. 既存データをクリア
    await db.execute(`UPDATE t_tournament_teams SET assigned_block = NULL, block_position = NULL WHERE tournament_id = ?`, [tournamentId]);
    
    // 2. 新しいデータを保存
    for (const block of blocks) {
      for (const team of block.teams) {
        await db.execute(`UPDATE t_tournament_teams SET assigned_block = ?, block_position = ? WHERE tournament_id = ? AND team_id = ?`, [block.block_name, team.block_position, tournamentId, team.team_id]);
      }
    }
    
    // 3. 関連データの更新
    // ... 試合データ更新処理
    
    return NextResponse.json({ success: true });
  } catch (error) {
    // トランザクションロールバックは使用できないため、
    // エラー時の対処は個別に実装する必要がある
    throw error;
  }
}
```

#### **注意事項**
- 本番環境でもこの制限は適用される
- データベース設計時にトランザクション前提の処理を避ける
- 複雑な処理は複数のAPI呼び出しに分割することを検討する


## ⏰ タイムゾーン仕様

### 基本方針
本システムでは**日本標準時（JST = UTC+9）**を標準タイムゾーンとして使用します。

### データベース設計
#### **SQLite datetime関数の使用**
- **標準形式**: `datetime('now', '+9 hours')` 
- **非推奨**: `CURRENT_TIMESTAMP`（UTC時刻で記録されるため）
- **非推奨**: `datetime('now')`（UTC時刻で記録されるため）

#### **実装例**
```sql
-- ✅ 正しい日本時間での記録
INSERT INTO table_name (created_at, updated_at) 
VALUES (datetime('now', '+9 hours'), datetime('now', '+9 hours'));

-- ✅ 更新時の日本時間
UPDATE table_name 
SET updated_at = datetime('now', '+9 hours') 
WHERE id = ?;

-- ❌ 避けるべき（UTC時刻が記録される）
INSERT INTO table_name (created_at) VALUES (CURRENT_TIMESTAMP);
INSERT INTO table_name (created_at) VALUES (datetime('now'));
```

### 適用箇所
以下の全てのタイムスタンプフィールドで日本時間を使用：

#### **API エンドポイント**
- `lib/standings-calculator.ts`: 順位表更新時刻
- `app/api/tournaments/[id]/join/route.ts`: チーム・選手登録時刻
- `lib/match-result-handler.ts`: 試合結果確定時刻
- `app/api/tournaments/[id]/manual-rankings/route.ts`: 手動順位更新時刻
- `app/api/teams/register/route.ts`: チーム新規登録時刻
- `app/api/teams/players/route.ts`: 選手情報更新時刻
- `app/api/admin/tournaments/[id]/teams/route.ts`: 管理者代行登録時刻
- `app/api/matches/[id]/status/route.ts`: 試合状態更新時刻

#### **主要テーブル**
- `m_teams`: チームマスターの作成・更新日時
- `m_players`: 選手マスターの作成・更新日時
- `t_tournament_teams`: 大会参加チームの登録・更新日時
- `t_tournament_players`: 大会参加選手の登録・更新日時
- `t_match_blocks`: ブロック順位表の更新日時
- `t_matches_final`: 試合結果の確定日時
- `t_match_status`: 試合状態の更新日時

### 運用上の利点
1. **ユーザー体験**: 日本の運営者・参加者に分かりやすい時刻表示
2. **データ整合性**: 全システム内で統一された時刻基準
3. **トラブルシューティング**: ログ時刻とユーザー操作時刻の一致
4. **運営効率**: 大会スケジュールとシステム時刻の自然な対応

### 注意事項
- デプロイ先（Vercel）のサーバー時刻に依存せず、SQLite関数で明示的に日本時間を指定
- フロントエンド表示では `toLocaleString('ja-JP')` で日本形式での時刻表示を推奨
- 日付比較処理では時差を考慮した適切な処理を実装

## 🔐 パスワードリセットトークンテーブル

### テーブル: `t_password_reset_tokens`

チーム代表者のパスワードリセット機能で使用するワンタイムトークンを管理します。

#### テーブル定義

```sql
CREATE TABLE t_password_reset_tokens (
    token_id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    reset_token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    FOREIGN KEY (team_id) REFERENCES m_teams(team_id) ON DELETE CASCADE
);

CREATE INDEX idx_reset_token ON t_password_reset_tokens(reset_token);
CREATE INDEX idx_team_reset_tokens ON t_password_reset_tokens(team_id);
CREATE INDEX idx_expires_at ON t_password_reset_tokens(expires_at);
```

#### カラム説明

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| token_id | INTEGER | PRIMARY KEY | トークンID（自動採番） |
| team_id | TEXT | NOT NULL, FK | チームID（`m_teams.team_id`参照） |
| reset_token | TEXT | NOT NULL, UNIQUE | リセットトークン（64文字のランダムハッシュ） |
| expires_at | DATETIME | NOT NULL | トークン有効期限（JST、発行から1時間） |
| used_at | DATETIME | NULL | トークン使用日時（JST、未使用の場合はNULL） |
| created_at | DATETIME | DEFAULT | トークン作成日時（JST、自動設定） |

#### 機能仕様

**トークン生成:**
- `crypto.randomBytes(32).toString('hex')` で暗号学的に安全なトークンを生成
- 有効期限は発行時刻から1時間後に設定（`datetime('now', '+9 hours', '+1 hour')`）

**トークン検証:**
1. トークンの存在確認
2. 使用済みチェック（`used_at IS NULL`）
3. 有効期限チェック（現在時刻 < `expires_at`）

**セキュリティ:**
- ワンタイムトークン（1回使用後は`used_at`に使用時刻を記録）
- 有効期限切れトークンは自動的に無効化
- チーム削除時にトークンも連動削除（`ON DELETE CASCADE`）

**クリーンアップ:**
- 同一チームの未使用トークンは新規発行時に自動削除
- 期限切れトークンは定期的にクリーンアップ可能（`idx_expires_at`で高速検索）

#### 実装ファイル

- API: `/app/api/auth/forgot-password/route.ts` - トークン発行・メール送信
- API: `/app/api/auth/reset-password/route.ts` - トークン検証・パスワード更新
- 画面: `/app/auth/forgot-password/page.tsx` - パスワード忘れ申請画面
- 画面: `/app/auth/reset-password/page.tsx` - パスワードリセット実行画面

