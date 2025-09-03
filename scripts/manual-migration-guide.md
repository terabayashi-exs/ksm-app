# Tursoデータベース移行ガイド

このガイドでは、本番データベース（ksm-prod）から開発データベース（ksm-dev）へのデータ移行方法を説明します。

## 前提条件

- Node.js がインストールされていること
- npm がインストールされていること  
- bash シェルが使用可能であること
- プロジェクトの `scripts` ディレクトリにアクセスできること

## 移行方法

### 方法1: 一括移行スクリプト（推奨）

最も簡単な方法は、一括移行スクリプトを使用することです：

```bash
cd /path/to/ksm-app
node scripts/migrate-data.js
```

このスクリプトは自動的に以下の処理を行います：
1. 本番データベースからデータをダンプ
2. 開発データベースへデータをリストア

### 方法2: 手動での段階的実行

より細かい制御が必要な場合は、個別のスクリプトを使用できます：

#### Step 1: 本番データベースからダンプ

```bash
cd /path/to/ksm-app
./scripts/turso-dump.sh 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io' 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg'
```

このコマンドは `turso-dump-YYYYMMDD_HHMMSS.sql` という名前のダンプファイルを作成します。

#### Step 2: 開発データベースへリストア

```bash
node scripts/restore-database.js turso-dump-YYYYMMDD_HHMMSS.sql
```

確認プロンプトが表示されるので、`yes` と入力して続行します。  
強制的に実行する場合は `--force` オプションを追加します：

```bash
node scripts/restore-database.js turso-dump-YYYYMMDD_HHMMSS.sql --force
```

## スクリプトの詳細

### turso-dump.sh
- 本番データベースからデータを取得してSQLファイルに保存
- Turso CLIとsqlite3が必要
- 出力ファイル名にタイムスタンプを付与

### restore-database.js
- SQLダンプファイルを読み込んで開発データベースに適用
- 安全のため、開発用データベース（ksm-dev）以外では動作しません
- 既存データは削除されるため、注意が必要です

### migrate-data.js
- 上記2つのスクリプトを連続実行する便利スクリプト
- エラーハンドリング付き

## 注意事項

1. **データの上書き**: リストア処理は既存のデータをすべて削除してから新しいデータを挿入します
2. **環境確認**: 必ず開発環境で実行してください（本番環境では動作しません）
3. **バックアップ**: 重要なデータがある場合は、事前にバックアップを取ってください
4. **認証情報**: 本番データベースの認証トークンは適切に管理してください

## トラブルシューティング

### Turso CLIがインストールされていない場合
```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

### sqlite3がインストールされていない場合
```bash
# Ubuntu/Debian
sudo apt-get install sqlite3

# macOS
brew install sqlite3
```

### 権限エラーが発生する場合
```bash
chmod +x scripts/turso-dump.sh
chmod +x scripts/restore-database.js
chmod +x scripts/migrate-data.js
```

### @libsql/clientがインストールされていない場合
```bash
npm install @libsql/client
```

## 環境変数の設定

開発環境の `.env.local` ファイルに以下が設定されていることを確認してください：

```env
DATABASE_URL="libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io"
DATABASE_AUTH_TOKEN="your-dev-auth-token"
```

## 移行後の確認

移行が完了したら、以下のコマンドでデータが正しく移行されたか確認できます：

```bash
node scripts/check-database-status.js
```

または、開発サーバーを起動して動作確認を行ってください：

```bash
npm run dev
```