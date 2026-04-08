# KSM-App

PK選手権大会の運営システム。大会情報の登録、チーム・選手管理、試合スケジュール作成、結果入力・公開まで、大会運営の全フローをカバーするWebアプリケーションです。

## 技術スタック

- **フレームワーク**: Next.js 15.5.7 (App Router) + React 19.0.0
- **言語**: TypeScript 5.x
- **スタイリング**: Tailwind CSS 4 + shadcn/ui
- **データベース**: Turso (libSQL) + Drizzle ORM
- **認証**: NextAuth.js 4.24.11
- **デプロイ**: Vercel

## クイックスタート

```bash
# 開発ツールのインストール（macOS）
brew bundle

# Node.jsバージョンの設定
mise install

# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env.local
# .env.localを編集（チームリーダーから取得）

# データベースの初期化
npm run db:migrate
npm run db:seed-master

# 開発サーバーの起動
npm run dev
```

詳細は[新規開発者ガイド](./docs/guides/onboarding.md)を参照してください。

## ドキュメント

- [プロジェクト仕様書](./CLAUDE.md) — 全体概要・開発ルール
- [新規開発者ガイド](./docs/guides/onboarding.md) — セットアップ手順
- [アーキテクチャ設計](./docs/specs/architecture.md) — 技術詳細
- [データベース設計](./docs/specs/database.md) — テーブル設計
- [実装済み機能一覧](./docs/features/implemented-features.md) — 機能仕様
- [ドキュメント索引](./docs/README.md) — 全ドキュメント一覧
