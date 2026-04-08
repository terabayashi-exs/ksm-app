# 開発環境セットアップガイド

KSM-Appプロジェクトの開発環境のセットアップと開発コマンドについて説明します。

初回セットアップは[新規開発者ガイド](./onboarding.md)を参照してください。

## 必要なツール

| ツール | バージョン | 用途 |
|--------|-----------|------|
| Node.js | 22.17.1（`.mise.toml`で固定） | ランタイム |
| mise | 最新 | Node.jsバージョン管理 |
| npm | Node.js同梱版 | パッケージ管理 |

## 環境変数（.env.local）

```bash
# Turso Database（開発環境）
DATABASE_URL="<YOUR_DATABASE_URL>"
DATABASE_AUTH_TOKEN="<YOUR_AUTH_TOKEN>"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<YOUR_NEXTAUTH_SECRET>"

# 環境別DB接続情報
DATABASE_URL_DEV="<YOUR_DATABASE_URL_DEV>"
DATABASE_AUTH_TOKEN_DEV="<YOUR_AUTH_TOKEN_DEV>"
DATABASE_URL_STAG="<YOUR_DATABASE_URL_STAG>"
DATABASE_AUTH_TOKEN_STAG="<YOUR_AUTH_TOKEN_STAG>"
DATABASE_URL_MAIN="<YOUR_DATABASE_URL_MAIN>"
DATABASE_AUTH_TOKEN_MAIN="<YOUR_AUTH_TOKEN_MAIN>"

# メール送信
GMAIL_USER="<YOUR_GMAIL>"
GMAIL_APP_PASSWORD="<YOUR_APP_PASSWORD>"

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN="<YOUR_BLOB_TOKEN>"

# 管理者デフォルト設定（任意）
ADMIN_DEFAULT_EMAIL="admin@example.com"
ADMIN_DEFAULT_PASSWORD="<YOUR_ADMIN_PASSWORD>"
```

環境変数の取得方法はチームリーダーに確認してください。

## 開発コマンド

### サーバー起動
```bash
npm run dev          # 開発サーバー起動（port 3000）
npm run dev:turbo    # Turbopack使用（高速）
npm run build        # プロダクションビルド
npm run start        # プロダクションサーバー起動
```

### コード品質
```bash
npm run lint          # ESLint実行
npm run format        # Biomeフォーマット実行
npm run format:check  # フォーマットチェック（修正なし）
npm run test          # Vitestテスト実行
npm run test:watch    # テストウォッチモード
```

### データベース
```bash
npm run db:generate      # マイグレーションファイル生成
npm run db:migrate       # マイグレーション適用（dev環境）
npm run db:migrate:stag  # マイグレーション適用（stag環境）
npm run db:migrate:main  # マイグレーション適用（本番環境）
npm run db:push          # スキーマ直接適用（開発用・履歴なし）
npm run db:studio        # Drizzle Studio（GUI）
npm run db:seed-master   # マスターデータ投入
```

詳細は[マイグレーションガイド](./database-migration.md)を参照してください。

### ユーティリティ
```bash
npm run clean        # .next キャッシュ削除
npm run clean:all    # node_modules含む完全クリーン
npm run storybook    # Storybook起動
```

## セットアップ手順

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.local`ファイルを作成し、上記の環境変数を設定

### 3. データベースの初期化
```bash
npm run db:migrate       # マイグレーション適用
npm run db:seed-master   # マスターデータ投入
```

### 4. 開発サーバー起動
```bash
npm run dev
```

## マスターデータの登録

### 自動登録（推奨）
```bash
npm run db:seed-master
```

### 手動でデータを編集する場合
以下のJSONファイルを編集してからコマンドを実行：

- `./data/venues.json` — 会場データ
- `./data/tournament_formats.json` — 大会フォーマットデータ
- `./data/match_templates.json` — 試合テンプレートデータ

データ登録の特徴：
- 既存データを自動削除してから新規登録
- 登録件数を表示して確認可能
