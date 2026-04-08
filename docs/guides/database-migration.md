# データベースマイグレーションガイド

[← 開発ガイドに戻る](./development.md)

このドキュメントでは、Drizzle ORMを使ったデータベースマイグレーションの詳細手順を説明します。

## 概要

KSM-AppではDrizzle ORMでスキーマとマイグレーションを管理しています。
データベースはTurso（libSQL）を使用し、3つの環境（dev / stag / main）で運用しています。

## カスタムマイグレーター

**このプロジェクトでは、Turso専用のカスタムマイグレーター（`scripts/migrate-turso.ts`）を使用しています。**

標準の`drizzle-kit migrate`はTursoで以下の問題があるため：
- ブロックコメント（`/* */`）のパースエラー
- 複数SQL文の一括実行不可（Turso HTTPプロトコルの制限）

カスタムマイグレーターの特徴：
- ブロックコメントを自動削除
- SQL文を1つずつ実行（Turso対応）
- 既存テーブル/カラムのエラーを自動スキップ
- 環境別実行対応（dev/stag/main）
- 冪等性保証（何度実行しても安全）
- `__drizzle_migrations`テーブルで履歴管理

## ディレクトリ構成

```
src/db/
├── schema.ts      # テーブル定義
├── relations.ts   # テーブル間のリレーション定義
└── index.ts       # データベース接続クライアント

drizzle/
├── schema.ts      # 生成されたスキーマ（pullコマンドで更新）
├── relations.ts   # 生成されたリレーション定義
└── 0000_*.sql     # マイグレーションファイル
```

## 環境別コマンド

### Dev環境（デフォルト）
```bash
npm run db:pull         # dev環境からスキーマを取得
npm run db:push         # dev環境にスキーマを直接適用（開発用）
npm run db:generate     # マイグレーションファイルを生成
npm run db:migrate      # マイグレーションを適用
npm run db:studio       # Drizzle Studio（GUI）を起動
```

### Stag環境
```bash
npm run db:pull:stag
npm run db:push:stag
npm run db:generate:stag
npm run db:migrate:stag
npm run db:studio:stag
```

### Main環境（本番）
```bash
npm run db:pull:main
npm run db:push:main
npm run db:generate:main
npm run db:migrate:main
npm run db:studio:main
```

## 標準的なマイグレーションフロー（推奨）

```bash
# 1. src/db/schema.ts を編集してフィールドを追加/削除

# 2. マイグレーションファイルを生成
npm run db:generate

# 3. Dev環境で適用とテスト
npm run db:migrate

# 4. Stag環境で検証
npm run db:migrate:stag

# 5. 本番環境に適用
npm run db:migrate:main

# 6. 【重要】MIGRATION_HISTORY.md を更新
```

## クイックプロトタイピング（開発時のみ）

マイグレーション履歴が残らないため、**本番環境では非推奨**です。

```bash
# 1. src/db/schema.ts を編集
# 2. Dev環境で即座に反映
npm run db:push:dev
```

## マイグレーション実行時の必須ルール

データベーススキーマを変更した場合、以下を**必ず実行**してください：

### 1. マイグレーション方法の選択
- **通常は標準マイグレーション**を使用（`npm run db:generate` → `npm run db:migrate`）
- `breakpoints: false`設定により、Tursoでも問題なく動作します
- 迅速な開発時のみ`npm run db:push`を使用（ただし履歴は残らない）

### 2. MIGRATION_HISTORY.md を更新
- `MIGRATION_HISTORY.md` の最上部に新しいエントリを追加
- ファイル内のテンプレートを使用して記録
- 以下の情報を必ず含める：
  - 日付、環境（dev/stag/main）
  - 変更内容（テーブル名、カラム名、型）
  - 変更理由
  - 影響を受けたファイルのリスト
  - 実行したコマンド

### 3. コミット時の注意
- `MIGRATION_HISTORY.md` を必ずコミットに含める
- スキーマ変更とマイグレーション履歴は同じコミットにする
- マイグレーションファイル（`drizzle/XXXX_*.sql`）もコミット対象
- コミットメッセージに `migration:` プレフィックスを付ける

**例（標準マイグレーション）:**
```bash
git add MIGRATION_HISTORY.md src/db/schema.ts drizzle/000X_*.sql drizzle/meta/
git commit -m "migration: フィールドXXXを追加"
```

**例（db:push使用時）:**
```bash
git add MIGRATION_HISTORY.md src/db/schema.ts
git commit -m "migration: フィールドXXXを追加（db:push使用）"
```

## 環境変数設定

`.env.local` には以下の環境別変数が必要です：

```bash
# デフォルト接続先（dev環境）
DATABASE_URL="libsql://ksm-dev-..."
DATABASE_AUTH_TOKEN="<YOUR_AUTH_TOKEN>"

# 環境別接続情報
DATABASE_URL_DEV="libsql://ksm-dev-..."
DATABASE_AUTH_TOKEN_DEV="<YOUR_AUTH_TOKEN>"

DATABASE_URL_STAG="libsql://ksm-stag-..."
DATABASE_AUTH_TOKEN_STAG="<YOUR_AUTH_TOKEN>"

DATABASE_URL_MAIN="libsql://ksm-main-..."
DATABASE_AUTH_TOKEN_MAIN="<YOUR_AUTH_TOKEN>"
```

**注意**: Vercel上の環境変数は別途Vercel Dashboardで設定する必要があります。

## よくあるコマンド

```bash
# データベースのGUIツールを起動（ブラウザで開く）
npm run db:studio

# 既存データベースからスキーマを取得（初回セットアップ時）
npm run db:pull

# テストスクリプト実行
npx tsx scripts/test-drizzle.ts
```

## 参考ドキュメント
- [Drizzle ORM 入門ガイド](./drizzle-orm-guide.md)
- [Drizzle Seeder ガイド](./drizzle-seeder-guide.md)
