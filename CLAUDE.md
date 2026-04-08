# KSM-App プロジェクト仕様書

> PK選手権大会の運営システム（大会管理・チーム登録・試合運営・結果公開）
> **技術スタック**: Next.js 15.5.7 (App Router) / React 19 / TypeScript 5 / Tailwind CSS 4 / Drizzle ORM 0.45.1 / Turso (libSQL) / NextAuth.js 4.24.11
> **規模**: 41テーブル / 180 APIエンドポイント / 85ページ

## クイックスタート

```bash
npm install                 # 依存関係インストール
cp .env.example .env.local  # 環境変数設定（チームから取得）
npm run db:generate         # マイグレーション生成
npm run db:migrate          # マイグレーション適用
npm run db:seed-master      # マスターデータ投入
npm run dev                 # 開発サーバー起動
```

## 開発コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動（port 3000） |
| `npm run build` | プロダクションビルド |
| `npm run lint` | ESLint実行（Next.js固有ルール） |
| `npm run format` | Biomeフォーマット実行 |
| `npm run format:check` | フォーマットチェック（修正なし） |
| `npm run test` | Vitestテスト実行 |
| `npm run db:generate` | マイグレーションファイル生成 |
| `npm run db:migrate` | マイグレーション適用（dev環境） |
| `npm run db:migrate:stag` | マイグレーション適用（stag環境） |
| `npm run db:migrate:main` | マイグレーション適用（本番環境） |
| `npm run db:studio` | Drizzle Studio起動 |

## コード品質ツール

### Biome（フォーマッター + Import整理）
```bash
npx biome format --write <file>  # 単一ファイルのフォーマット
npm run format                    # 全ファイルのフォーマット
npm run format:check              # CI用チェック
```

### ESLint（リンター）
Next.js固有のルール（react-hooks, a11y等）を担当。Biomeとは役割分離済み。
```bash
npm run lint
```

### Claude Codeへの指示
- ファイル作成・大幅編集後は `npx biome format --write <file>` を実行すること
- コミット前に `npm run lint` と `npm run build` で問題がないことを確認すること

## マイグレーションルール

スキーマ変更時は以下を**必ず**守ること（詳細は[マイグレーションガイド](./docs/guides/database-migration.md)参照）：

1. `npm run db:generate` → `npm run db:migrate` で適用
2. `MIGRATION_HISTORY.md` の最上部にエントリ追加（日付・変更内容・理由・影響ファイル）
3. スキーマ変更・マイグレーションファイル・MIGRATION_HISTORY.mdを同一コミットにする
4. コミットメッセージに `migration:` プレフィックスを付ける

## ブランチ運用ルール

- `main` — 本番環境。直接pushしない。PRマージのみ。
- `dev` — 開発統合ブランチ。PRベースでマージする。
- `feature/*` — 機能開発ブランチ（devから分岐、devへPR）
- `fix/*` — バグ修正ブランチ（devから分岐、devへPR）

### PRルール
- PRを作成したら、GitHub ActionsのCI（Biome + ESLint + ビルド）が自動で走る
- CIが通らないPRはマージしない
- dev → main のマージは本番リリース時のみ

## 設計方針と制約

- 複数大会の同時開催に対応（大会IDベースで全体を構成）
- チーム・選手は大会単位で分離
- 管理側はPC、公開側はスマートフォンを想定（レスポンシブ対応）
- 日本標準時（JST = UTC+9）を統一使用
- テーブル命名: `m_`（マスタ）/ `t_`（トランザクション）

## コーディング規約

- ファイル・フォルダ名: `kebab-case`
- Reactコンポーネント: `PascalCase`
- 関数・変数: `camelCase`
- 定数: `UPPER_SNAKE_CASE`
- データベース: `snake_case`

## ドキュメントマップ

### 技術仕様
- [アーキテクチャ設計](./docs/specs/architecture.md) — 技術スタック詳細、ファイル構成
- [データベース設計](./docs/specs/database.md) — テーブル設計、制約、タイムゾーン仕様
- [実装状況](./docs/specs/implementation-status.md) — 実装フェーズ、運用実績
- [トーナメント表ロジック](./docs/specs/tournament-bracket-logic.md) — ブロック配分、描画仕様

### 機能仕様
- [実装済み機能一覧](./docs/features/implemented-features.md) — 全機能の索引と詳細リンク

### 開発ガイド
- [開発環境セットアップ](./docs/guides/development.md) — 環境構築、コマンド
- [新規開発者ガイド](./docs/guides/onboarding.md) — オンボーディング手順
- [マイグレーションガイド](./docs/guides/database-migration.md) — Drizzle ORM / Turso対応
- [Drizzle ORM入門](./docs/guides/drizzle-orm-guide.md) — ORM基本操作
- [Drizzle Seeder](./docs/guides/drizzle-seeder-guide.md) — マスターデータ投入
- [Blob Storageセットアップ](./docs/guides/blob-setup-guide.md) — Vercel Blob設定

### デザイン
- [UI設計方針](./docs/design/uidesign-basic-policy.md) — カラー、タイポグラフィ、レイアウト

### その他
- [ER図](./docs/database/KSM.md) — Mermaid形式のデータベース図
- [ドキュメント索引](./docs/README.md) — 全ドキュメントのナビゲーション
