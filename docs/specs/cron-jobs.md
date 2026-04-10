# 定期バッチ処理（Vercel Cron）

Vercel Cron を利用した定期実行ジョブの仕様。設定は `vercel.json` で管理。

## ジョブ一覧

| ジョブ | パス | スケジュール | 説明 |
|-------|------|------------|------|
| 大会ステータス更新 | `/api/cron/update-tournament-status` | 毎日 02:00 JST | 全大会のステータスを日付ベースで再計算 |
| トークンクリーンアップ | `/api/cron/cleanup-expired-tokens` | 毎日 03:00 JST | 期限切れトークン・招待の一括削除 |

## 認証

すべてのCronエンドポイントは `CRON_SECRET` 環境変数による Bearer トークン認証を行う。
Vercel が自動的に `Authorization: Bearer <CRON_SECRET>` ヘッダーを付与する。

---

## トークンクリーンアップ仕様

### 対象テーブルと削除条件

#### 1. `t_match_result_tokens`（試合結果QRトークン）

| 条件 | 処理 |
|------|------|
| 関連試合の `tournament_date` が30日以上前 | 削除 |

- トークン自体に有効期限はなく、時間制限は `getTimeWindowStatus()` で制御
- 試合削除時は外部キー CASCADE で自動削除されるが、試合データは残るためバッチで明示的に削除

#### 2. `t_password_reset_tokens`（パスワードリセットトークン）

| 条件 | 処理 |
|------|------|
| `expires_at` が過去 かつ `used_at` IS NULL（未使用の期限切れ） | 削除 |
| `used_at` IS NOT NULL かつ 7日以上前（使用済み） | 削除 |

- トークン有効期限: 発行から1時間
- 新規発行時に同一ユーザーの旧トークンは削除されるが、ユーザーが再発行しなかった場合に残る

#### 3. `t_email_verification_tokens`（メール認証トークン）

| 条件 | 処理 |
|------|------|
| `expires_at` が過去 かつ `used = 0`（未使用の期限切れ） | 削除 |
| `used = 1` かつ `used_at` が7日以上前（使用済み） | 削除 |

- トークン有効期限: 発行から10分
- 再発行時に旧トークンは `used = 1` にマークされるが、レコード自体は残る

#### 4. `t_team_invitations`（チーム管理者招待）

| 条件 | 処理 |
|------|------|
| `expires_at` が過去 かつ `status = 'pending'` | `status` を `'expired'` に更新 |
| `status` が `'expired'` or `'cancelled'` かつ `created_at` が30日以上前 | 削除 |

- 招待有効期限: 発行から72時間
- 承認済み（`accepted`）の招待は削除しない（履歴として保持）

#### 5. `t_operator_invitations`（運営者招待）

| 条件 | 処理 |
|------|------|
| `expires_at` が過去 かつ `status = 'pending'` | `status` を `'expired'` に更新 |
| `status` が `'expired'` or `'cancelled'` かつ `created_at` が30日以上前 | 削除 |

- 招待有効期限: 発行から7日
- 承認済み（`accepted`）の招待は削除しない（履歴として保持）

### 対象外

| テーブル | 除外理由 |
|---------|---------|
| `t_format_access_grants` | アクセス権管理テーブルであり一時トークンではない |

### 実装ファイル

- `app/api/cron/cleanup-expired-tokens/route.ts`
- `vercel.json`（スケジュール定義）
