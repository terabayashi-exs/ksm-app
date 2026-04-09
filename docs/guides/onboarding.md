# 新規開発者ガイド（オンボーディング）

KSM-Appプロジェクトに参加する新規メンバー向けのセットアップガイドです。

## 学習パス（推奨する読み順）

### Day 1: 全体像を掴む（読むだけ、30分程度）
1. **[システム全体像](./system-overview.md)** — 「このシステムは何をするのか」を理解（業務フロー・ユーザーロール・画面構成）
2. **[用語集](./glossary.md)** — 「大会」と「部門」の違いなど、コードを読む前に知っておくべき用語

### Day 1〜2: 環境構築（本ドキュメントの手順に沿って進める、1〜2時間）
3. **本ドキュメント（onboarding.md）** — Git設定 → クローン → npm install → 開発サーバー起動まで

### Day 2〜3: 技術面を理解（読む＋コードを追う）
4. **[アーキテクチャ](../specs/architecture.md)** — 技術スタック・フォルダ構成・コーディング規約
5. **[ER図](../database/KSM.md)** — テーブル全体像をビジュアルで把握

### Day 3〜: コードを書き始めるとき
6. **[開発レシピ集](./development-recipes.md)** — API追加・画面追加・カラム追加の具体的な手順
7. **[トラブルシューティング](./troubleshooting.md)** — 困ったときに都度参照

## Step 0: Gitの初期設定とGitHub接続

PCを新しくセットアップする場合、まずGitとGitHubの接続を行います。
既にGitとSSH鍵の設定が完了している場合は [Step 1](#step-1-前提ツールのインストール) に進んでください。

### 0-1. Gitのインストール

#### macOS

```bash
# Xcodeコマンドラインツール（Gitを含む）をインストール
xcode-select --install

# または Homebrew 経由
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git
```

#### WSL（Ubuntu）/ Linux

```bash
sudo apt update
sudo apt install git curl
```

### 0-2. Gitの基本設定

```bash
# ユーザー名とメールアドレスを設定（GitHubアカウントと同じものを使用）
git config --global user.name "あなたの名前"
git config --global user.email "your-email@example.com"

# デフォルトブランチ名をmainに設定
git config --global init.defaultBranch main
```

### 0-3. SSH鍵の作成とGitHubへの登録

```bash
# SSH鍵を生成（メールアドレスはGitHubと同じもの）
ssh-keygen -t ed25519 -C "your-email@example.com"
# → すべてEnterでOK（パスフレーズは任意）

# SSH agentを起動して鍵を登録
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# 公開鍵をコピー
cat ~/.ssh/id_ed25519.pub
# → 表示された内容をすべてコピー
```

**GitHubに公開鍵を登録**:
1. [GitHub → Settings → SSH and GPG keys](https://github.com/settings/keys) にアクセス
2. 「New SSH key」をクリック
3. Title に任意の名前（例: `MacBook Pro`）を入力
4. Key にコピーした公開鍵を貼り付け
5. 「Add SSH key」をクリック

**接続テスト**:
```bash
ssh -T git@github.com
# → "Hi username! You've been successfully authenticated..." と表示されればOK
```

### 0-4. GitHubアカウントへのアクセス確認

チームリーダーから以下を確認してください:
- リポジトリへのアクセス権限が付与されていること
- リポジトリのSSH URLを共有してもらうこと

---

## Step 1: 前提ツールのインストール

### macOS の場合

| ツール | 用途 | インストール方法 |
|--------|------|-----------------|
| **Homebrew** | パッケージ管理 | https://brew.sh |
| **Git** | バージョン管理 | `brew install git`（Step 0で済み） |
| **mise** | Node.jsバージョン管理 | `brew install mise` |

### WSL（Ubuntu）/ Linux の場合

| ツール | 用途 | インストール方法 |
|--------|------|-----------------|
| **Git** | バージョン管理 | `sudo apt install git`（Step 0で済み） |
| **mise** | Node.jsバージョン管理 | `curl https://mise.run \| sh` |
| **curl** | 通信ツール | `sudo apt install curl`（未インストールの場合） |

## セットアップ手順

### 1. リポジトリのクローン

```bash
# SSH URL でクローン（チームリーダーからURLを確認）
git clone git@github.com:<organization>/<repository>.git
cd ksm-app

# devブランチに切り替え
git checkout dev
```

### 2. 開発ツールのインストール

#### macOS

```bash
# Brewfileに定義された開発ツールを一括インストール
brew bundle

# mise の有効化（zsh の場合）
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
```

#### WSL（Ubuntu）/ Linux

```bash
# mise の有効化（bash の場合）
echo 'eval "$(mise activate bash)"' >> ~/.bashrc
source ~/.bashrc
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

**チームリーダーから `.env.local` ファイルを受け取り**、プロジェクトルートに配置してください。

> **受け渡し方法**: `.env.local` にはデータベースの認証情報が含まれるため、Slackやメール本文での共有は避けてください。パスワードマネージャーの共有機能、または直接のファイル受け渡しを推奨します。
>
> **Claude Codeで環境構築する場合**: Claude Codeは環境変数を自動取得できません。`.env.local` ファイルを**事前に手動で配置**してから、Claude Codeに残りのセットアップを依頼してください。

#### 必須（開発サーバーの起動に必要）

```bash
# Turso Database（開発環境）
DATABASE_URL="libsql://ksm-dev-..."        # dev環境のTurso DB URL
DATABASE_AUTH_TOKEN="eyJ..."               # dev環境の認証トークン

# NextAuth（認証）
NEXTAUTH_URL="http://localhost:3000"       # この値は固定
NEXTAUTH_SECRET="..."                      # セッション暗号化キー
```

#### オプション（該当機能の開発時に必要）

```bash
# 環境別DB接続（マイグレーション実行時のみ必要）
DATABASE_URL_DEV="..."
DATABASE_AUTH_TOKEN_DEV="..."
DATABASE_URL_STAG="..."                    # ステージング環境
DATABASE_AUTH_TOKEN_STAG="..."
DATABASE_URL_MAIN="..."                    # 本番環境
DATABASE_AUTH_TOKEN_MAIN="..."

# メール送信（メール機能の開発時に必要）
GMAIL_USER="..."
GMAIL_APP_PASSWORD="..."

# Vercel Blob Storage（ファイルアップロード機能の開発時に必要）
BLOB_READ_WRITE_TOKEN="..."
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

### まず読むべきもの（推奨順）

| # | ドキュメント | 内容 |
|---|------------|------|
| 1 | [システム全体像](./system-overview.md) | 業務フロー、ユーザーロール、画面構成の全体像 |
| 2 | [用語集](./glossary.md) | 業務用語・技術用語・DB名と画面表示の対応 |
| 3 | [アーキテクチャ](../specs/architecture.md) | 技術スタック、フォルダ構成、コーディング規約 |
| 4 | [データベース設計](../specs/database.md) / [ER図](../database/KSM.md) | テーブル設計、制約、リレーション |

### 開発時に参照するもの

| ドキュメント | 内容 |
|------------|------|
| [開発レシピ集](./development-recipes.md) | API追加・画面追加・カラム追加の手順 |
| [開発環境](./development.md) | コマンド一覧、環境設定 |
| [マイグレーション](./database-migration.md) | DB変更手順 |
| [テスト方針](./testing.md) | Vitest / Playwright / Storybook |
| [トラブルシューティング](./troubleshooting.md) | よくあるエラーと対処法 |
| [実装済み機能一覧](../features/implemented-features.md) | 全機能の詳細仕様 |
| [UI設計方針](../design/uidesign-basic-policy.md) | デザインガイドライン |
