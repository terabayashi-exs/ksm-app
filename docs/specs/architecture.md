# アーキテクチャ設計仕様書

このドキュメントでは、KSM-Appプロジェクトの技術スタック、アーキテクチャ、コーディング規約について詳述します。

## 🔧 使用技術（2025年12月12日時点）

### **フロントエンド**
- **Next.js**: 15.5.7（App Router）
- **React**: 19.0.0
- **TypeScript**: 5.x（型安全性100%）
- **Tailwind CSS**: 4.x（レスポンシブデザイン）
- **shadcn/ui**: モダンUIコンポーネント
- **Lucide React**: 0.534.0（アイコンライブラリ）

### **バックエンド・API**
- **Next.js API Routes**: 100+エンドポイント実装
- **Server-Sent Events**: リアルタイム更新
- **Server Actions**: フォーム処理最適化

### **データベース・認証**
- **Turso**: リモートSQLite（本番・開発環境）
- **@libsql/client**: 0.15.9（Tursoクライアント）
- **NextAuth.js**: 4.24.11（セッション管理）
- **bcryptjs**: 3.0.2（パスワードハッシュ化）
- **JWT**: 審判アクセストークン

### **ストレージ**
- **Vercel Blob**: 2.0.0（ファイルストレージ）
- 大会関連ファイル（PDF等）の管理
- 管理者ロゴ画像の保存

### **フォーム・バリデーション**
- **React Hook Form**: 7.61.1（高性能フォーム）
- **Zod**: 4.0.14（スキーマバリデーション）
- **@hookform/resolvers**: 5.2.1（リゾルバー統合）

### **UI・スタイリング**
- **Tailwind CSS**: 4.x（PostCSS統合）
- **class-variance-authority**: 0.7.1（バリアント管理）
- **tailwind-merge**: 3.3.1（クラス結合）
- **tailwindcss-animate**: 1.0.7（アニメーション）
- **Radix UI**: 複数コンポーネント（Alert Dialog, Checkbox, Dialog等）

### **ユーティリティ・ツール**
- **date-fns**: 4.1.0（日付処理・JST対応）
- **clsx**: 2.1.1（条件付きスタイリング）
- **zustand**: 5.0.7（状態管理）
- **react-dropzone**: 14.3.8（ファイルアップロード）

### **PDF・画像処理**
- **jsPDF**: 3.0.1（PDF生成）
- **html2canvas**: 1.4.1（HTML→画像変換）

### **メール送信**
- **nodemailer**: 6.10.1（メール配信）

### **デプロイ・インフラ**
- **Vercel**: 本番デプロイ・CI/CD
- **Turso**: 分散SQLiteデータベース
- **Vercel Analytics**: 1.5.0（アクセス解析）
- **環境分離**: 開発・本番データベース完全分離

### **開発ツール**
- **tsx**: 4.20.3（TypeScript実行）
- **ESLint**: 9.x（コード品質）
- **cross-env**: 10.0.0（環境変数管理）


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

### ファイル・フォルダ構成（2025年12月12日時点）
```
ksm-app/
├── README.md
├── CLAUDE.md                     # プロジェクト仕様書（メインドキュメント）
├── next.config.ts
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
├── middleware.ts                 # 認証ミドルウェア
├── .gitignore
│
├── docs/                         # ドキュメント（分割構成）
│   ├── specs/                    # 技術仕様
│   │   ├── architecture.md       # アーキテクチャ設計
│   │   ├── database.md           # データベース設計
│   │   └── implementation-status.md  # 実装状況
│   ├── features/                 # 機能仕様
│   │   ├── implemented-features.md   # 実装済み機能一覧（索引）
│   │   ├── subscription-system.md    # サブスクリプション課金
│   │   ├── standings-system.md       # 順位表システム
│   │   ├── manual-rankings.md        # 手動順位設定
│   │   ├── match-management.md       # 試合管理
│   │   ├── withdrawal-system.md      # 辞退管理
│   │   └── archive-system.md         # アーカイブシステム
│   ├── guides/                   # 開発ガイド
│   │   └── development.md        # 開発環境セットアップ
│   └── database/                 # データベース設計
│       ├── KSM.md                # ER図（Mermaid記法）
│       └── schema.sql            # DDL定義
│
├── data/                         # マスターデータ
│   ├── venues.json               # 会場マスター
│   ├── tournament_formats.json   # 大会フォーマット
│   └── match_templates.json      # 試合テンプレート
│
├── scripts/                      # データベース・マイグレーションスクリプト（50+ファイル）
│   ├── init-db.ts                # データベース初期化
│   ├── seed-master-data.js       # マスターデータ投入
│   ├── migrate-*.js              # 各種マイグレーション
│   └── create-admin.js           # 管理者作成
│
├── app/                          # App Router (Next.js 15)
│   ├── layout.tsx                # ルートレイアウト
│   ├── page.tsx                  # トップページ
│   │
│   ├── auth/                     # 認証関連ルート
│   │   ├── login/page.tsx        # ログインページ
│   │   └── register/page.tsx     # チーム登録ページ
│   │
│   ├── admin/                    # 管理者画面（20+ページ）
│   │   ├── page.tsx              # 管理者ダッシュボード
│   │   ├── profile/page.tsx      # プロフィール管理（ロゴアップロード等）
│   │   ├── administrators/page.tsx   # 管理者一覧
│   │   ├── venues/page.tsx       # 会場管理
│   │   ├── teams/page.tsx        # チーム管理
│   │   ├── sport-types/          # 競技種別管理
│   │   │   ├── page.tsx
│   │   │   └── create/page.tsx
│   │   ├── tournament-formats/   # 大会フォーマット管理
│   │   │   ├── page.tsx
│   │   │   ├── create/page.tsx
│   │   │   └── [id]/edit/page.tsx
│   │   ├── tournament-groups/    # 大会グループ管理
│   │   │   ├── page.tsx
│   │   │   ├── create/page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── [id]/edit/page.tsx
│   │   ├── tournaments/          # 大会管理
│   │   │   ├── page.tsx          # 大会一覧
│   │   │   ├── create-new/page.tsx   # 新規大会作成
│   │   │   ├── duplicate/page.tsx    # 大会複製
│   │   │   └── [id]/             # 個別大会管理
│   │   │       ├── page.tsx      # 大会詳細
│   │   │       ├── edit/page.tsx # 大会編集
│   │   │       ├── teams/page.tsx    # チーム管理
│   │   │       ├── draw/page.tsx     # 組合せ抽選
│   │   │       ├── rules/page.tsx    # ルール設定
│   │   │       ├── courts/page.tsx   # コート管理
│   │   │       ├── matches/page.tsx  # 試合管理
│   │   │       ├── results/page.tsx  # 結果確認
│   │   │       ├── manual-rankings/page.tsx  # 手動順位設定
│   │   │       ├── match-overrides/page.tsx  # 試合進出条件調整
│   │   │       ├── files/page.tsx    # ファイル管理（Blob Storage）
│   │   │       └── qr-list/page.tsx  # QRコード一覧
│   │   ├── matches/[id]/qr/page.tsx  # 試合QRコード
│   │   ├── withdrawal-requests/page.tsx      # 辞退申請一覧
│   │   ├── withdrawal-statistics/page.tsx    # 辞退統計
│   │   └── blob-migration/page.tsx   # Blobマイグレーション管理
│   │
│   ├── team/                     # チーム向け画面
│   │   └── page.tsx              # チームダッシュボード
│   │
│   ├── tournaments/              # 大会関連ページ
│   │   ├── page.tsx              # 大会一覧（ログイン後）
│   │   └── [id]/
│   │       ├── join/page.tsx     # 大会参加登録
│   │       ├── teams/page.tsx    # チーム一覧
│   │       └── withdrawal/page.tsx   # 辞退申請
│   │
│   ├── public/tournaments/       # 一般公開画面
│   │   ├── groups/[id]/page.tsx  # グループ別大会一覧
│   │   └── [id]/
│   │       ├── page.tsx          # 公開大会詳細
│   │       ├── bracket/page.tsx  # トーナメント表
│   │       ├── bracket-pdf/page.tsx  # トーナメント表PDF
│   │       ├── results-pdf/page.tsx  # 結果表PDF
│   │       └── archived/page.tsx     # アーカイブ表示
│   │
│   ├── referee/match/[id]/page.tsx   # 審判用結果入力（QR認証）
│   │
│   ├── test/page.tsx             # テストページ
│   │
│   └── api/                      # API Routes（100+エンドポイント）
│       ├── auth/[...nextauth]/route.ts   # NextAuth設定
│       ├── debug/                # デバッグAPI
│       │   ├── session/route.ts
│       │   └── db-info/route.ts
│       ├── administrators/       # 管理者API
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── venues/               # 会場API
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── teams/                # チームAPI
│       │   ├── register/route.ts
│       │   ├── profile/route.ts
│       │   ├── tournaments/route.ts
│       │   └── players/route.ts
│       ├── sport-types/route.ts  # 競技種別API
│       ├── tournament-groups/    # 大会グループAPI
│       │   ├── route.ts
│       │   ├── incomplete/route.ts
│       │   └── [id]/route.ts
│       ├── tournaments/          # 大会API（50+エンドポイント）
│       │   ├── route.ts
│       │   ├── dashboard/route.ts
│       │   ├── search/route.ts
│       │   ├── public/route.ts
│       │   ├── public-grouped/route.ts
│       │   ├── public-groups/[id]/route.ts
│       │   ├── create-new/route.ts
│       │   ├── formats/
│       │   │   ├── route.ts
│       │   │   ├── recommend/route.ts
│       │   │   └── [formatId]/templates/route.ts
│       │   └── [id]/             # 個別大会API
│       │       ├── route.ts
│       │       ├── delete/route.ts
│       │       ├── teams/route.ts
│       │       ├── draw/route.ts
│       │       ├── rules/route.ts
│       │       ├── courts/route.ts
│       │       ├── matches/route.ts
│       │       ├── public-matches/route.ts
│       │       ├── match-news/route.ts
│       │       ├── results/route.ts
│       │       ├── results-enhanced/route.ts
│       │       ├── standings/route.ts
│       │       ├── manual-rankings/route.ts
│       │       ├── bracket/route.ts
│       │       ├── match-overrides/
│       │       │   ├── route.ts
│       │       │   ├── bulk/route.ts
│       │       │   ├── affected/route.ts
│       │       │   └── [overrideId]/route.ts
│       │       ├── files/route.ts
│       │       ├── public-files/route.ts
│       │       ├── qr-list/route.ts
│       │       ├── live-updates/route.ts
│       │       ├── archive/route.ts
│       │       ├── archived-view/route.ts
│       │       ├── withdrawal/route.ts
│       │       └── recalculate-standings/route.ts
│       ├── matches/              # 試合API
│       │   ├── confirm/route.ts
│       │   └── [id]/
│       │       ├── status/route.ts
│       │       ├── confirm/route.ts
│       │       ├── unconfirm/route.ts
│       │       ├── cancel/route.ts
│       │       ├── uncancel/route.ts
│       │       ├── qr/route.ts
│       │       ├── scores-extended/route.ts
│       │       └── extended-info/route.ts
│       ├── admin/                # 管理者専用API
│       │   ├── sport-types/route.ts
│       │   ├── tournament-formats/
│       │   │   ├── route.ts
│       │   │   └── [id]/
│       │   │       ├── route.ts
│       │   │       └── duplicate/route.ts
│       │   ├── tournaments/
│       │   │   ├── route.ts
│       │   │   ├── active/route.ts
│       │   │   ├── duplicate/route.ts
│       │   │   └── [id]/
│       │   │       ├── teams/route.ts
│       │   │       ├── teams/delete/route.ts
│       │   │       ├── files/
│       │   │       │   ├── route.ts
│       │   │       │   ├── upload/route.ts
│       │   │       │   └── [fileId]/route.ts
│       │   │       ├── delete-data/route.ts
│       │   │       └── archive-cleanup/route.ts
│       │   ├── withdrawal-requests/
│       │   │   ├── route.ts
│       │   │   ├── bulk-process/route.ts
│       │   │   └── [id]/
│       │   │       ├── process/route.ts
│       │   │       └── impact/route.ts
│       │   ├── withdrawal-statistics/route.ts
│       │   ├── notifications/
│       │   │   ├── route.ts
│       │   │   ├── counts/route.ts
│       │   │   └── [id]/resolve/route.ts
│       │   ├── archived-tournaments/route.ts
│       │   ├── profile/logo/route.ts
│       │   ├── blob-statistics/route.ts
│       │   ├── migrate-to-blob/route.ts
│       │   ├── migration-status/route.ts
│       │   └── migration-verify/route.ts
│       └── test/                 # テストAPI
│           ├── blob/route.ts
│           └── blob-performance/route.ts
│
├── components/                   # 共通コンポーネント（100+ファイル）
│   └── ui/                       # shadcn/ui コンポーネント
│       ├── alert-dialog.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── progress.tsx
│       ├── select.tsx
│       ├── switch.tsx
│       ├── tabs.tsx
│       └── textarea.tsx
│
├── lib/                          # ユーティリティ・設定
│   ├── auth.ts                   # NextAuth設定
│   ├── db.ts                     # Turso接続
│   ├── blob.ts                   # Vercel Blob設定
│   ├── utils.ts                  # 共通ユーティリティ
│   ├── types.ts                  # TypeScript型定義
│   ├── constants.ts              # 定数定義
│   ├── score-parser.ts           # スコアデータ解析（JSON配列形式統一）⭐
│   ├── standings-calculator.ts   # 順位表計算
│   ├── match-result-handler.ts   # 試合結果処理
│   └── email.ts                  # メール送信
│
├── types/                        # 型定義
│   └── next-auth.d.ts            # NextAuth型拡張
│
├── src/                          # 旧構造（Next.js移行前の残存ファイル）
│   └── app/
│       ├── layout.tsx
│       └── page.tsx
│
└── public/                       # 静的ファイル
    ├── next.svg
    └── vercel.svg

```

