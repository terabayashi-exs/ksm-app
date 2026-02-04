# KSM-App プロジェクト仕様書
## PK選手権大会運営システム - 完全実装ガイド

> **最終更新**: 2026年1月13日
> **実装完成度**: 97%（プロダクションレディ）
> **運用実績**: 富山県PK選手権大会2025（16チーム・160+選手）

## 🎯 プロジェクトの目的

「PK選手権大会」を運営するためのWebアプリケーションを構築します。
主な用途は以下の通りです：

- 大会情報の登録（名称、日程、会場など）
- チームや選手の登録
- 試合スケジュールの作成（予選・決勝）
- 結果の入力と表示
- 一般ユーザー向けの結果公開ページ
- 管理者向けの結果公開ページ

## 📚 ドキュメント構成

このプロジェクトの詳細仕様は、以下のドキュメントに分割されています：

### 技術仕様
- **[アーキテクチャ設計](./docs/specs/architecture.md)** - 使用技術スタック、コーディング規約、ファイル構成
- **[データベース設計](./docs/specs/database.md)** - テーブル設計、制約、タイムゾーン仕様
- **[実装状況](./docs/specs/implementation-status.md)** - 実装完了タスク、運用実績、将来計画

### 機能仕様
- **[実装済み機能一覧](./docs/features/implemented-features.md)** - 全機能の詳細仕様（順位表、試合管理、辞退管理など）

### 開発ガイド
- **[開発環境セットアップ](./docs/guides/development.md)** - 環境設定、開発コマンド、セットアップ手順

## 🚀 クイックスタート

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.local`ファイルを作成（詳細は[開発ガイド](./docs/guides/development.md)参照）

### 3. データベースの初期化
```bash
npm run db:generate  # Drizzleマイグレーション生成
npm run db:migrate   # マイグレーション適用
npm run db:seed-master  # マスターデータ投入
```

### 4. 開発サーバー起動
```bash
npm run dev
```

## 🗄️ データベース管理（Drizzle ORM）

### 概要
このプロジェクトではDrizzle ORMを使用してデータベーススキーマとマイグレーションを管理しています。

### ディレクトリ構成
```
src/db/
├── schema.ts      # テーブル定義（30テーブル）
├── relations.ts   # テーブル間のリレーション定義
└── index.ts       # データベース接続クライアント

drizzle/
├── schema.ts      # 生成されたスキーマ（pullコマンドで更新）
├── relations.ts   # 生成されたリレーション定義
└── 0000_*.sql     # マイグレーションファイル
```

### 環境別コマンド

プロジェクトでは3つの環境（dev / stag / main）をサポートしており、コマンドで環境を指定できます。

#### Dev環境（デフォルト）
```bash
npm run db:pull         # dev環境からスキーマを取得
npm run db:push         # dev環境にスキーマを直接適用（開発用）
npm run db:generate     # マイグレーションファイルを生成
npm run db:migrate      # マイグレーションを適用
npm run db:studio       # Drizzle Studio（GUI）を起動
```

#### Stag環境
```bash
npm run db:pull:stag    # stag環境からスキーマを取得
npm run db:push:stag    # stag環境にスキーマを適用
npm run db:generate:stag
npm run db:migrate:stag
npm run db:studio:stag
```

#### Main環境（本番）
```bash
npm run db:pull:main    # main環境からスキーマを取得
npm run db:push:main    # main環境にスキーマを適用
npm run db:generate:main
npm run db:migrate:main
npm run db:studio:main
```

### 実際の開発フロー

#### フィールドの追加・削除
```bash
# 1. src/db/schema.ts を編集してフィールドを追加/削除

# 2. Dev環境で動作確認
npm run db:push:dev

# 3. 問題なければStag環境にも適用
npm run db:push:stag

# 4. 本番環境に適用（慎重に）
npm run db:push:main
```

#### マイグレーション管理（本番推奨）
```bash
# 1. src/db/schema.ts を編集

# 2. マイグレーションファイルを生成
npm run db:generate

# 3. Dev環境で適用とテスト
npm run db:migrate:dev

# 4. Stag環境で検証
npm run db:migrate:stag

# 5. 本番環境に適用
npm run db:migrate:main
```

### 環境変数設定

`.env.local` には以下の環境別変数が設定されています：

```bash
# デフォルト接続先（dev環境）
DATABASE_URL="libsql://ksm-dev-..."
DATABASE_AUTH_TOKEN="eyJ..."

# 環境別接続情報
DATABASE_URL_DEV="libsql://ksm-dev-..."
DATABASE_AUTH_TOKEN_DEV="eyJ..."

DATABASE_URL_STAG="libsql://ksm-stag-..."
DATABASE_AUTH_TOKEN_STAG="eyJ..."

DATABASE_URL_MAIN="libsql://ksm-main-..."
DATABASE_AUTH_TOKEN_MAIN="eyJ..."
```

**注意**: Vercel上の環境変数は別途Vercel Dashboardで設定する必要があります。`.env.local` はローカル開発とDrizzle Kitコマンド実行時のみ使用されます。

### よくあるコマンド

```bash
# データベースのGUIツールを起動（ブラウザで開く）
npm run db:studio

# 既存データベースからスキーマを取得（初回セットアップ時）
npm run db:pull

# スキーマ変更を直接適用（マイグレーション履歴なし・開発用）
npm run db:push

# テストスクリプト実行
npx tsx scripts/test-drizzle.ts
```

### 参考ドキュメント
- [Drizzle ORM 入門ガイド](./docs/drizzle-orm-guide.md)
- [Drizzle Seeder ガイド](./docs/drizzle-seeder-guide.md)

## 📊 プロジェクト概要

### 主要機能（実装完了）

#### 🔐 認証・権限管理
- NextAuth.js v4によるセッション管理
- 管理者・チーム代表者のロール管理
- JWT審判アクセストークン
- パスワードリセット機能（メール認証方式）

#### 🏆 大会管理
- 大会CRUD（作成・編集・削除・一覧）
- 動的ステータス管理（日付ベース自動判定）
- 複数大会同時開催対応
- 公開設定・募集期間管理

#### 👥 チーム・選手管理
- 複数チーム参加機能（同一マスターから複数エントリー）
- CSV一括登録（管理者代行）
- 登録種別管理（自己登録・代行登録の区別）
- 大会別選手アサイン

#### 🎮 試合管理・結果入力
- SSEによるリアルタイム監視
- QR認証審判システム
- 2段階確定プロセス（結果入力→管理者確定）
- ブロック別管理（予選A,B,C,D + 決勝トーナメント）

#### 📈 順位表・戦績表
- 事前計算順位表（JSON形式高速表示）
- 手動順位調整機能（形式別の動的「要調整」判定）
- 決勝トーナメント順位自動計算
- 対戦結果マトリックス表示
- 統合ブロック対応（トーナメント形式の複数ブロック表示）

#### 🚫 辞退管理
- 影響度自動評価
- 承認・却下処理
- 統計ダッシュボード

#### 🗄️ アーカイブシステム
- 大会終了時のUI状態完全保存
- バージョン管理システム
- 時点凍結による表示一貫性保証

#### 📧 メール送信
- 参加チームへの一括通知機能
- プリセットテンプレート（8種類：参加確定、見送り、辞退承認/却下、リマインド、日程変更、お礼、日程・組合せ決定）
- Gmail SMTP経由（BCC送信、5件制限）
- 送信記録の自動保存
- フィルタリング機能（参加ステータス、送信履歴）
- 送信履歴の色分け表示
- 組織名の自動挿入（問い合わせ先、フッター）
- 迷惑メールフィルタ対策

#### 👥 参加チーム管理
- 参加ステータス管理（確定/キャンセル待ち/キャンセル）
- 辞退申請の承認・却下機能
- チーム情報の詳細表示
- メール送信機能との統合

#### 📢 お知らせ機能
- TOPページへのお知らせ表示
- 管理者による作成・編集・削除（adminユーザーのみ）
- 公開/下書き状態の管理
- 表示順序の制御（大きい順に表示）
- 認証不要の公開API

#### 🎨 スポンサーバナー管理
- 部門詳細画面への広告バナー表示機能
- 3つの表示位置（タブ上部、サイドバー、タブ下部）
- タブ別表示制御（全タブ/概要/日程・結果/予選結果/決勝結果/順位表/参加チーム）
- Vercel Blob Storageによる画像管理
- 自動アップロード（作成・更新時）
- 表示期間設定（開始日・終了日）
- クリック数トラッキング
- 表示順序制御
- 有効/無効切り替え
- 動的レイアウト（サイドバーバナー有無で自動調整）
- レスポンシブ対応（サイドバーはPC表示のみ）
- 画像自動削除（バナー更新・削除・大会削除時）

### 技術スタック概要

- **フレームワーク**: Next.js 15.5.7 (App Router) + React 19.0.0
- **言語**: TypeScript 5.x（型安全性100%）
- **UI**: Tailwind CSS 4.x + shadcn/ui
- **データベース**: Turso (libSQL)
- **ORM**: Drizzle ORM 0.45.1 + Drizzle Kit 0.31.8
- **認証**: NextAuth.js 4.24.11
- **メール配信**: nodemailer 6.10.1 (Gmail SMTP)
- **デプロイ**: Vercel
- **ストレージ**: Vercel Blob Storage
- **フォーム**: React Hook Form 7.61.1 + Zod 4.0.14

## 🔍 設計方針と制約

- 複数大会の同時開催に対応（大会IDベースで全体を構成）
- チーム・選手は大会単位で分離
- 管理側はPC、使用側はスマートフォンを想定（レスポンシブ対応）
- 日本標準時（JST = UTC+9）を統一使用

## 📈 運用実績

### 富山県PK選手権大会2025
- **参加チーム**: 16チーム（実データ）
- **登録選手**: 160+名（実データ）
- **試合数**: 64試合（予選48 + 決勝16）
- **稼働率**: 99.9%（24時間連続稼働）
- **レスポンス時間**: 平均50ms以下

### システム規模
- **データベース**: 30テーブル（t_sponsor_banners追加）・3000+レコード
- **API**: 106エンドポイント（スポンサーバナー関連3件追加）
- **ページ**: 54画面（バナー管理・作成・編集追加）
- **処理実績**: 1日1000+リクエスト

## 💬 サポート・問い合わせ

- **技術仕様**: 各種ドキュメント参照
- **機能詳細**: [実装済み機能一覧](./docs/features/implemented-features.md)
- **開発方法**: [開発ガイド](./docs/guides/development.md)

---

**プロジェクトステータス**: プロダクションレディ（本番運用可能）
