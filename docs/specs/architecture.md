# アーキテクチャ設計仕様書

このドキュメントでは、KSM-Appプロジェクトの技術スタック、アーキテクチャ、コーディング規約について詳述します。

## 🔧 使用技術（2025年8月16日時点）

### **フロントエンド**
- **Next.js**: 15.3.4（App Router）
- **React**: 19.0.0
- **TypeScript**: 5.x（型安全性100%）
- **Tailwind CSS**: 4.x（レスポンシブデザイン）
- **shadcn/ui**: モダンUIコンポーネント

### **バックエンド・API**
- **Next.js API Routes**: 40+エンドポイント実装
- **Server-Sent Events**: リアルタイム更新
- **Server Actions**: フォーム処理最適化

### **データベース・認証**
- **Turso**: リモートSQLite（本番・開発環境）
- **NextAuth.js**: 5.0.0-beta.29（セッション管理）
- **bcryptjs**: パスワードハッシュ化
- **JWT**: 審判アクセストークン

### **フォーム・バリデーション**
- **React Hook Form**: 7.61.1（高性能フォーム）
- **Zod**: 4.0.14（スキーマバリデーション）

### **ユーティリティ・ツール**
- **date-fns**: 日付処理・JST対応
- **Lucide React**: アイコンライブラリ
- **clsx**: 条件付きスタイリング
- **ESLint + Prettier**: コード品質統一

### **デプロイ・インフラ**
- **Vercel**: 本番デプロイ・CI/CD
- **Turso**: 分散SQLiteデータベース
- **環境分離**: 開発・本番データベース完全分離


## 🧩 設計方針と制約

- 複数大会の同時開催に対応（大会IDベースで全体を構成）
- チーム・選手は大会単位で分離（共通選手マスタは今回は不要）
- 管理側はPCでの閲覧を想定し、使用側はスマートフォン等からの閲覧を想定（レスポンシブ対応）
- 入力項目は設計ファイルの仕様に従う（文字数・IME・選択形式など）



## 📝 コーディング規約・命名ルール
- ファイル・フォルダ名: kebab-case
- React コンポーネント: PascalCase
- 関数・変数: camelCase
- 定数: UPPER_SNAKE_CASE
- CSS クラス: kebab-case
- データベース: snake_case

### TypeScript 型定義例
```typescript
// lib/types.ts
export interface Tournament {
  tournament_id: number;
  tournament_name: string;
  format_id: number;
  venue_id: number;
  team_count: number;
  status: 'planning' | 'ongoing' | 'completed';
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Team {
  team_id: string;
  team_name: string;
  team_omission?: string;
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  is_active: boolean;
}

export interface Match {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_display_name: string;
  team2_display_name: string;
  court_number?: number;
  start_time?: string;
  team1_goals: number;
  team2_goals: number;
  winner_team_id?: string;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  result_status: 'none' | 'pending' | 'confirmed';
  remarks?: string;
}
```

### ファイル・フォルダ構成（現在の実装状況）
```
ksm-app/
├── README.md
├── CLAUDE.md                     # プロジェクト仕様書
├── next.config.ts
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.tsbuildinfo
├── eslint.config.mjs
├── postcss.config.mjs
├── next-env.d.ts
├── middleware.ts                 # 認証ミドルウェア
├── dev-server.pid
├── .gitignore
│
├── docs/                         # ドキュメント
│   └── database/
│       ├── KSM.md                # ER図
│       ├── schema.sql            # DDL定義
│       └── schema-updated.sql    # 更新されたDDL
│
├── data/                         # マスターデータ
│   ├── venues.json
│   ├── tournament_formats.json
│   └── match_templates.json
│
├── scripts/                      # データベース・ユーティリティスクリプト
│   ├── init-db.ts
│   ├── seed-master-data.js
│   ├── add-tournament-players.js
│   ├── check-database-status.js
│   ├── check-db-data.js
│   ├── check-tournament-players-table.mjs
│   ├── create-tournament-players-table.sql
│   ├── create-tournament-players.js
│   ├── detailed-database-check.js
│   ├── fix-tournament-players-table.mjs
│   ├── fix-unique-constraints.mjs
│   ├── migrate-remove-match-order.js
│   ├── migrate-tournament-players.mjs
│   └── test-api.js
│
├── app/                          # App Router (Next.js 14)
│   ├── layout.tsx                # ルートレイアウト
│   ├── page.tsx                  # トップページ
│   ├── globals.css               # グローバルCSS
│   ├── actions.ts                # Server Actions
│   │
│   ├── auth/                     # 認証関連ルート
│   │   ├── login/
│   │   │   └── page.tsx          # ログインページ
│   │   └── register/
│   │       └── page.tsx          # 登録ページ
│   │
│   ├── admin/                    # 管理者画面
│   │   ├── page.tsx              # 管理者ダッシュボード
│   │   ├── tournaments/          # 大会管理
│   │   │   ├── create/
│   │   │   │   └── page.tsx      # 大会作成
│   │   │   └── [id]/
│   │   │       └── edit/
│   │   │           └── page.tsx  # 大会編集
│   │   ├── teams/                # チーム管理
│   │   │   └── register/         # チーム登録
│   │   ├── matches/              # 試合管理
│   │   │   └── schedule/         # スケジュール作成
│   │   └── results/              # 結果管理
│   │       └── input/            # 結果入力
│   │
│   ├── public/                   # 一般公開画面
│   │   └── tournaments/          # 公開大会情報
│   │
│   ├── team/                     # チーム向け画面
│   │   └── page.tsx              # チームダッシュボード
│   │
│   ├── tournaments/              # 大会関連ページ
│   │   └── [id]/
│   │       └── join/
│   │           └── page.tsx      # 大会参加
│   │
│   ├── test/                     # テストページ
│   │   └── page.tsx
│   │
│   └── api/                      # API Routes
│       ├── auth/                 # 認証API
│       │   └── [...nextauth]/
│       │       └── route.ts      # NextAuth設定
│       ├── tournaments/          # 大会API
│       │   ├── route.ts          # 大会CRUD
│       │   ├── dashboard/
│       │   │   └── route.ts      # ダッシュボード
│       │   ├── formats/
│       │   │   ├── recommend/
│       │   │   │   └── route.ts  # フォーマット推奨
│       │   │   └── [formatId]/
│       │   │       └── templates/
│       │   │           └── route.ts # テンプレート取得
│       │   └── [id]/
│       │       ├── route.ts      # 個別大会操作
│       │       ├── join/
│       │       │   └── route.ts  # 大会参加
│       │       └── matches/
│       │           └── route.ts  # 試合情報
│       ├── teams/                # チームAPI
│       │   ├── register/
│       │   │   └── route.ts      # チーム登録
│       │   ├── profile/
│       │   │   └── route.ts      # チームプロフィール
│       │   ├── tournaments/
│       │   │   └── route.ts      # チーム大会情報
│       │   └── players/
│       │       └── route.ts      # 選手管理
│       ├── venues/               # 会場API
│       │   └── route.ts          # 会場CRUD
│       ├── matches/              # 試合API（ディレクトリのみ）
│       └── results/              # 結果API（ディレクトリのみ）
│
├── components/                   # 共通コンポーネント
│   ├── ui/                       # shadcn/ui コンポーネント
│   │   ├── alert.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   └── textarea.tsx
│   ├── layout/                   # レイアウト関連
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── providers/                # プロバイダー
│   │   └── session-provider.tsx  # セッション管理
│   ├── forms/                    # フォーム関連
│   │   ├── TournamentCreateForm.tsx
│   │   └── TournamentEditForm.tsx
│   ├── tables/                   # テーブル表示（ディレクトリのみ）
│   └── features/                 # 機能特化コンポーネント
│       ├── auth/
│       │   └── SignOutButton.tsx
│       ├── tournament/
│       │   ├── SchedulePreview.tsx
│       │   ├── TournamentDashboardList.tsx
│       │   └── TournamentJoinForm.tsx
│       ├── team/
│       │   ├── TeamProfile.tsx
│       │   └── TeamTournaments.tsx
│       ├── match/                # 試合関連（ディレクトリのみ）
│       └── standings/            # 順位表関連（ディレクトリのみ）
│
├── lib/                          # ユーティリティ・設定
│   ├── auth.ts                   # NextAuth設定
│   ├── db.ts                     # Turso接続
│   ├── utils.ts                  # 共通ユーティリティ
│   ├── validations.ts            # Zodスキーマ
│   ├── constants.ts              # 定数定義
│   ├── types.ts                  # TypeScript型定義
│   ├── schedule-calculator.ts    # スケジュール計算
│   ├── database-init.ts          # データベース初期化
│   ├── database-init-simple.ts   # 簡単データベース初期化
│   └── api/
│       └── tournaments.ts        # 大会API関数
│
├── hooks/                        # カスタムフック（ディレクトリのみ）
├── stores/                       # 状態管理（ディレクトリのみ）
├── types/                        # 型定義
│   └── next-auth.d.ts            # NextAuth型拡張
│
├── src/                          # 旧構造の残り
│   └── app/
│       ├── favicon.ico
│       ├── globals.css
│       ├── layout.tsx
│       └── page.tsx
│
└── public/                       # 静的ファイル
    ├── file.svg
    ├── globe.svg
    ├── next.svg
    ├── vercel.svg
    └── window.svg

```

