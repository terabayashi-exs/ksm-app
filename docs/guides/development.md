# 開発環境セットアップガイド

このドキュメントでは、KSM-Appプロジェクトの開発環境のセットアップ方法と開発コマンドについて説明します。

## 🔧 環境設定・必要な設定
```bash
# 基本パッケージ
npm install next@14 react react-dom typescript @types/node @types/react @types/react-dom

# UI・スタイリング
npm install tailwindcss postcss autoprefixer @tailwindcss/forms @tailwindcss/typography
npm install @radix-ui/react-slot @radix-ui/react-dropdown-menu lucide-react
npm install class-variance-authority clsx tailwind-merge

# フォーム・バリデーション
npm install react-hook-form @hookform/resolvers zod

# データベース・認証
npm install @libsql/client next-auth@beta
npm install bcryptjs @types/bcryptjs

# 状態管理・ユーティリティ
npm install zustand date-fns

# 開発ツール
npm install -D eslint eslint-config-next prettier eslint-config-prettier
npm install -D @types/bcryptjs
```

### 環境変数（.env.local）
```bash
# Turso Database Configuration (開発用)
DATABASE_URL="libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io"
DATABASE_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
# Turso Database (本番用)
#DATABASE_URL="libsql://ksm-prod-asditd.aws-ap-northeast-1.turso.io"
#DATABASE_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNzcyMzEsImlkIjoiODYzZDdiZGItYmJhMy00YTY1LWJkMmEtNWI3YmI4NzFiMGMzIiwicmlkIjoiNTY4MjgwMTEtYjdjNi00YmU1LThiMmMtYjZjOTg4M2RmMjc4In0.TD-vd-nxW-Hfu-se8ScYaFyA41ZkvUO5az3dFkz-7YnPNp1ofum6NgUBKVGPnMaXoJvdpLxIxZbZdfEUi8A_Cg"

# Next.js Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret-here"

# Development/Production Environment
NODE_ENV="development"

# Optional: Admin Configuration
ADMIN_DEFAULT_EMAIL="admin@example.com"
ADMIN_DEFAULT_PASSWORD="admin123"
```

### 開発コマンド
```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# 本番サーバー起動
npm run start

# コード品質チェック
npm run lint
npm run type-check

# データベース関連
npm run db:generate     # DDL生成
npm run db:migrate      # マイグレーション実行
npm run db:seed         # 初期データ投入
npm run db:seed-master  # マスターデータ登録（会場・フォーマット・テンプレート）
```



## 🚀 セットアップ手順

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.local`ファイルを作成し、上記の環境変数を設定

### 3. データベースの初期化
```bash
npm run db:generate  # DDL生成
npm run db:migrate   # テーブル作成
npm run db:seed      # 初期データ投入（必要に応じて）
```

### 4. マスターデータの登録
テスト用のマスターデータ（会場、大会フォーマット、試合テンプレート）を登録できます。

#### 自動登録（推奨）
```bash
npm run db:seed-master
```

#### 手動でデータを編集する場合
以下のJSONファイルを編集してからコマンドを実行：

**`./data/venues.json`** - 会場データ
```json
[
  {
    "venue_name": "中央スポーツパーク",
    "address": "東京都中央区スポーツ1-1-1", 
    "available_courts": 8,
    "is_active": 1
  }
]
```

**`./data/tournament_formats.json`** - 大会フォーマットデータ
```json
[
  {
    "format_name": "8チーム予選リーグ+決勝トーナメント",
    "target_team_count": 8,
    "format_description": "8チームを2ブロック（A・B）に分け、各ブロック4チームのリーグ戦。各ブロック上位2チームが決勝トーナメントに進出。"
  }
]
```

**`./data/match_templates.json`** - 試合テンプレートデータ
```json
[
  {
    "format_id": 1,
    "match_number": 1,
    "match_code": "A1",
    "match_type": "通常",
    "phase": "preliminary",
    "round_name": "予選Aブロック",
    "block_name": "A",
    "team1_source": "",
    "team2_source": "",
    "team1_display_name": "A1チーム",
    "team2_display_name": "A2チーム",
    "day_number": 1,
    "execution_priority": 1
  }
]
```

**データ登録の特徴:**
- 既存データを自動削除してから新規登録
- 登録件数を表示して確認可能
- スケジュールプレビューで即座に動作確認できる

### 5. 開発サーバー起動
```bash
npm run dev
```

