# 新規開発者ガイド（オンボーディング）

KSM-Appプロジェクトに参加する新規メンバー向けのセットアップガイドです。

## 前提条件

以下がインストールされていることを確認してください：

| ツール | 用途 | インストール方法 |
|--------|------|-----------------|
| **Homebrew** | パッケージ管理 | https://brew.sh |
| **Git** | バージョン管理 | `brew install git` |
| **mise** | Node.jsバージョン管理 | `brew install mise` |

## セットアップ手順

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd ksm-app
```

### 2. 開発ツールのインストール

```bash
# Brewfileに定義された開発ツールを一括インストール
brew bundle

# mise の有効化（シェルに応じて設定）
# bash の場合:
echo 'eval "$(mise activate bash)"' >> ~/.bashrc
# zsh の場合:
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc

# シェルを再起動するか、設定を読み込み
source ~/.bashrc  # または source ~/.zshrc
```

### 3. Node.js のインストール

```bash
# .mise.toml で指定されたバージョンが自動インストールされる
mise install

# バージョン確認
node --version  # v22.17.1 が表示されること
```

### 4. 依存関係のインストール

```bash
npm install
```

### 5. 環境変数の設定

チームリーダーから以下の情報を取得し、`.env.local`ファイルを作成してください：

```bash
# Turso Database（開発環境）
DATABASE_URL="<チームから取得>"
DATABASE_AUTH_TOKEN="<チームから取得>"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<チームから取得>"

# 環境別DB接続（必要に応じて）
DATABASE_URL_DEV="<チームから取得>"
DATABASE_AUTH_TOKEN_DEV="<チームから取得>"
DATABASE_URL_STAG="<チームから取得>"
DATABASE_AUTH_TOKEN_STAG="<チームから取得>"
DATABASE_URL_MAIN="<チームから取得>"
DATABASE_AUTH_TOKEN_MAIN="<チームから取得>"

# メール送信（開発時は任意）
GMAIL_USER="<チームから取得>"
GMAIL_APP_PASSWORD="<チームから取得>"

# Vercel Blob Storage（開発時は任意）
BLOB_READ_WRITE_TOKEN="<チームから取得>"
```

### 6. データベースの初期化

```bash
npm run db:migrate       # マイグレーション適用
npm run db:seed-master   # マスターデータ投入（会場・フォーマット・テンプレート）
```

### 7. 開発サーバーの起動

```bash
npm run dev
# http://localhost:3000 で開く
```

## プロジェクト概要

### システムの目的
PK選手権大会を運営するためのWebアプリケーションです。大会情報の登録、チーム・選手管理、試合スケジュール作成、結果入力・公開まで、大会運営の全フローをカバーします。

### 主な画面構成
- **管理者画面** (`/admin/`) — 大会・チーム・試合の管理（PC向け）
- **チーム画面** (`/my/`, `/tournaments/`) — チーム代表者向け（スマホ対応）
- **公開画面** (`/public/tournaments/`) — 一般公開の結果閲覧（スマホ対応）
- **審判画面** (`/referee/`) — QR認証による結果入力（スマホ対応）

### 技術スタック
- **フレームワーク**: Next.js 15.5.7（App Router）+ React 19
- **言語**: TypeScript 5（Strict mode）
- **スタイリング**: Tailwind CSS 4 + shadcn/ui
- **データベース**: Turso（libSQL）+ Drizzle ORM
- **認証**: NextAuth.js 4.24.11
- **デプロイ**: Vercel

詳細は[アーキテクチャ設計](../specs/architecture.md)を参照してください。

### データベース設計
- テーブル命名: `m_`プレフィックス（マスタ）、`t_`プレフィックス（トランザクション）
- 全41テーブル（マスタ系 + トランザクション系）

詳細は[データベース設計](../specs/database.md)を参照してください。

## 開発フロー

### ブランチ戦略（PRベース）
- `main` — 本番環境。直接pushしない。PRマージのみ。
- `dev` — 開発統合ブランチ。PRベースでマージする。
- `feature/*` — 機能開発ブランチ（devから分岐、devへPR）
- `fix/*` — バグ修正ブランチ（devから分岐、devへPR）

### 開発の流れ

```bash
# 1. devから作業ブランチを作成
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# 2. 開発・コミット

# 3. pushしてPRを作成
git push -u origin feature/my-feature
# GitHub上でdev宛のPRを作成

# 4. CIが通り、レビュー完了後にマージ
```

### コード品質チェック

コミット前に以下を確認してください（PRのCIでも自動チェックされます）。

#### ステップ1: フォーマット違反の確認

```bash
npm run format:check
```

フォーマット違反があるファイルが一覧表示されます。**ファイルは変更されません。**

#### ステップ2: フォーマットの一括適用

```bash
npm run format
```

Biomeが自動でコードを整形します。

#### ステップ3: 変更内容の確認

```bash
git diff --stat
```

フォーマットによって何が変わったか確認できます。

#### ステップ4: ESLint・ビルド確認

```bash
# リンター（Next.js固有ルールのチェック）
npm run lint

# ビルドが通るか確認
npm run build
```

#### まとめ（コミット前の一連の流れ）

```bash
npm run format:check  # 1. 違反ファイルの確認
npm run format        # 2. フォーマット適用
git diff --stat       # 3. 変更内容の確認
npm run lint          # 4. ESLintチェック
npm run build         # 5. ビルド確認
git add .             # 6. ステージング
git commit -m "..."   # 7. コミット
```

### マイグレーション

スキーマ変更時は必ず[マイグレーションガイド](./database-migration.md)に従ってください。

## Claude Code の設定（AI支援開発を利用する場合）

このプロジェクトではClaude Code（AI開発アシスタント）を活用しています。Claude Codeを使う場合、以下の設定を行うと、ファイル編集時にBiomeフォーマットが自動適用されます。

### 設定手順

`.claude/settings.json`を作成（または編集）し、以下を記載してください：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx biome format --write $CLAUDE_FILE_PATH 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### この設定の効果
- Claude Codeがファイルを編集・作成するたびに、Biomeフォーマットが自動で適用されます
- 手動でフォーマットを実行する手間が省けます

### 注意
- `.claude/`ディレクトリは`.gitignore`対象のため、**各開発者がローカルで設定する必要があります**
- Claude Codeを使わない開発者はこの設定は不要です

## 主要ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [CLAUDE.md](../../CLAUDE.md) | プロジェクト仕様書（全体概要） |
| [アーキテクチャ](../specs/architecture.md) | 技術スタック、コーディング規約 |
| [データベース設計](../specs/database.md) | テーブル設計、制約 |
| [実装済み機能一覧](../features/implemented-features.md) | 全機能の詳細仕様 |
| [開発環境](./development.md) | コマンド一覧、環境設定 |
| [マイグレーション](./database-migration.md) | DB変更手順 |
| [UI設計方針](../design/uidesign-basic-policy.md) | デザインガイドライン |
