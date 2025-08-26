# 本番用データベース構築ガイド

ksm-devからksm-prodへのデータベース移行手順です。

## 🎯 概要

開発用データベース（ksm-dev）から本番用データベース（ksm-prod）への移行を支援するスクリプトを提供します。

### 提供するスクリプト

1. **`migrate-to-production.js`** - テーブル構造の構築
2. **`copy-master-data.js`** - マスターデータのコピー

## 🚀 手順

### Step 1: 本番用データベースのテーブル構造を構築

```bash
# 1. 環境変数を本番用に設定
# .env.local で以下を本番用に変更：
DATABASE_URL="libsql://ksm-prod-xxx.turso.io"
DATABASE_AUTH_TOKEN="本番用トークン"

# 2. テーブル構造を構築
npm run db:migrate-production
```

**実行内容:**
- `docs/database/schema.sql` のDDLを実行
- 全テーブル（12個）とインデックスを作成
- 既存テーブルは `IF NOT EXISTS` により保護

### Step 2: マスターデータをコピー（オプション）

開発用のマスターデータを本番環境に移行したい場合：

```bash
# 開発用データベース情報を環境変数で指定（オプション）
DEV_DATABASE_URL="libsql://ksm-dev-xxx.turso.io"
DEV_DATABASE_AUTH_TOKEN="開発用トークン"

# マスターデータをコピー
npm run db:copy-master-data
```

**コピー対象:**
- ✅ `m_venues` - 会場マスター
- ✅ `m_tournament_formats` - 大会フォーマット
- ✅ `m_match_templates` - 試合テンプレート  
- ✅ `m_teams` - チームマスター
- ✅ `m_players` - 選手マスター
- ❌ `m_administrators` - 管理者（保護のため除外）

**コピー対象外:**
- `t_*` テーブル（トランザクションデータ）は移行しません

### Step 3: 本番用管理者アカウントの作成

```bash
# 本番用の初期データ投入（管理者アカウント含む）
npm run db:seed-master
```

または手動でSQL実行：

```sql
-- 管理者アカウント作成（パスワード: admin123）
INSERT INTO m_administrators (admin_login_id, password_hash, email) 
VALUES ('admin', '$2a$10$hashedpassword', 'admin@yourcompany.com');
```

## 📋 実行例

### テーブル構造構築

```
🚀 本番用データベースへのマイグレーション開始...
📍 接続先: libsql://ksm-prod-xxx.turso.io
📄 スキーマファイル読み込み完了

📊 統計情報:
  - CREATE TABLE文: 12個
  - INDEX文: 15個
  - その他の文: 0個
  - 総実行文数: 27個

✅ データベースは空です。新規にテーブルを作成します。

🔄 [1/27] CREATE TABLE IF NOT EXISTS m_venues (...
🔄 [2/27] CREATE TABLE IF NOT EXISTS m_tournament_formats (...
...

🎉 マイグレーション完了！
📈 実行結果:
  - 成功: 27個
  - スキップ: 0個
  - 合計: 27個

📋 作成されたテーブル一覧:
🗂️  マスターテーブル:
  - m_administrators
  - m_match_templates
  - m_players
  - m_teams
  - m_tournament_formats
  - m_venues

🗂️  トランザクションテーブル:
  - t_match_blocks
  - t_matches_final
  - t_matches_live
  - t_tournament_players
  - t_tournament_teams
  - t_tournaments
```

### マスターデータコピー

```
🔄 マスターデータコピー開始...
📤 コピー元（開発用）: ksm-dev
📥 コピー先（本番用）: ksm-prod

🔍 m_venues を処理中...
🗑️  m_venues: 既存データを削除
✅ m_venues: 3件のデータをコピー完了

🔍 m_tournament_formats を処理中...
✅ m_tournament_formats: 5件のデータをコピー完了

🔍 m_match_templates を処理中...
✅ m_match_templates: 48件のデータをコピー完了

🎉 マスターデータコピー完了！
📈 統計:
  - 成功テーブル: 5個
  - コピー総件数: 156件
  - エラーテーブル: 0個
```

## ⚠️ 注意事項

### セキュリティ
- 本番用データベースの認証情報は適切に管理してください
- 開発用のパスワードは本番環境で使用しないでください
- 管理者アカウントのパスワードは必ず変更してください

### データ保護
- 既存の本番データは `DELETE FROM` により削除されます
- 重要なデータがある場合は事前にバックアップしてください
- `m_administrators` テーブルはコピー対象外（保護されます）

### エラー対処
- 接続エラー: 認証情報とネットワーク接続を確認
- 権限エラー: Tursoデータベースの書き込み権限を確認
- スキーマエラー: 開発用と本番用でテーブル構造の差異を確認

## 🔧 カスタマイズ

### 環境変数

```bash
# .env.local
DATABASE_URL="本番用URL"
DATABASE_AUTH_TOKEN="本番用トークン"

# オプション（デフォルト値あり）
DEV_DATABASE_URL="開発用URL" 
DEV_DATABASE_AUTH_TOKEN="開発用トークン"
```

### コピー対象テーブルの変更

`scripts/copy-master-data.js` の `masterTables` 配列を編集：

```javascript
const masterTables = [
  'm_venues',
  'm_tournament_formats', 
  'm_match_templates',
  // 必要に応じて追加・削除
];
```

## 📞 サポート

問題が発生した場合：
1. エラーメッセージを確認
2. データベース接続情報を再確認  
3. Tursoダッシュボードでデータベース状態を確認
4. 必要に応じて開発チームに連絡