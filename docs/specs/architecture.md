# アーキテクチャ設計仕様書

このドキュメントでは、KSM-Appプロジェクトの技術スタック、アーキテクチャ、コーディング規約について詳述します。

## 🔧 使用技術（2026年4月時点）

### **フロントエンド**
- **Next.js**: 15.5.7（App Router）
- **React**: 19.0.0
- **TypeScript**: 5.x（型安全性100%）
- **Tailwind CSS**: 4.x（レスポンシブデザイン）
- **shadcn/ui**: モダンUIコンポーネント
- **Lucide React**: 0.534.0（アイコンライブラリ）

### **バックエンド・API**
- **Next.js API Routes**: 180エンドポイント実装
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
- **ESLint**: 9.x（コード品質・Next.js固有ルール）
- **Biome**: フォーマッター・Import整理
- **Vitest**: 4.0.16（ユニットテスト）
- **Playwright**: 1.57.0（E2Eテスト）
- **Storybook**: 10.1.10（UIコンポーネント開発）
- **cross-env**: 10.0.0（環境変数管理）
- **mise**: Node.jsバージョン管理（v22.17.1固定）


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

型定義の全体は `lib/types.ts` を参照してください。以下は主要な型の抜粋です。

```typescript
// lib/types.ts
/**
 * 用語マッピング:
 * - 大会 (Tournament Event) = t_tournament_groups テーブル → TournamentGroup
 * - 部門/コース (Division/Category) = t_tournaments テーブル → Tournament
 */

export interface Tournament {
  tournament_id: number;
  tournament_name: string;
  format_id: number;
  venue_id: string | null;         // JSON配列 例: "[1, 3]"
  team_count: number;
  court_count: number;
  tournament_dates?: string;       // JSON形式: {"1": "2024-02-01", "2": "2024-02-03"}
  match_duration_minutes: number;
  break_duration_minutes: number;
  display_match_duration?: string;
  status: TournamentStatus;
  visibility: number;
  sport_type_id?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // ... 他多数（joined fields, グループ関連 等）
}

export interface Team {
  team_id: string;
  team_name: string;
  team_omission?: string;
  contact_phone?: string;
  is_active: boolean;
}

export interface TournamentTeam {
  tournament_team_id: number;      // 大会内固有のチームID
  tournament_id: number;
  team_id: string;                 // マスターチームID
  team_name: string;               // 大会エントリー時のチーム名
  team_omission: string;
  assigned_block?: string;
  block_position?: number;
  withdrawal_status: WithdrawalStatus;
  // ... 辞退関連フィールド等
}

export interface Match {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  // tournament_team_id ベース（team1_id/team2_id は後方互換用）
  team1_tournament_team_id?: number;
  team2_tournament_team_id?: number;
  winner_tournament_team_id?: number;
  team1_display_name: string;
  team2_display_name: string;
  court_number?: number;
  start_time?: string;
  team1_goals: number;             // 合計得点（scores は JSON配列で管理）
  team2_goals: number;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  result_status: 'none' | 'pending' | 'confirmed';
  // テンプレート独立化フィールド
  phase?: string;
  match_type?: string;
  round_name?: string;
  block_name?: string;
  // ... 他多数
}
```

### ファイル・フォルダ構成（2026年4月時点）

> 主要なディレクトリのみ記載。各ディレクトリ内の詳細はソースコードを参照してください。

```
ksm-app/
├── CLAUDE.md                     # プロジェクト仕様書（Claude Code用）
├── MIGRATION_HISTORY.md          # マイグレーション履歴
├── package.json
├── tsconfig.json
├── next.config.ts
├── drizzle.config.ts             # Drizzle ORM設定
├── biome.json                    # Biomeフォーマッター設定
├── eslint.config.mjs             # ESLint設定
├── vitest.config.ts              # Vitestテスト設定
├── tailwind.config.ts
├── postcss.config.mjs
├── vercel.json                   # Vercelデプロイ設定
├── middleware.ts                 # 認証ミドルウェア
├── .mise.toml                    # Node.jsバージョン管理（v22.17.1）
├── Brewfile                      # macOS開発ツール定義
│
├── src/                          # データベーススキーマ
│   └── db/
│       ├── schema.ts             # Drizzle ORMスキーマ定義（41テーブル）
│       ├── relations.ts          # テーブル間リレーション定義
│       └── index.ts              # DB接続・エクスポート
│
├── app/                          # App Router (Next.js 15)
│   ├── layout.tsx                # ルートレイアウト
│   ├── page.tsx                  # トップページ
│   ├── admin/                    # 管理者画面（18セクション）
│   │   ├── tournaments/          #   大会管理
│   │   ├── tournament-groups/    #   大会グループ管理
│   │   ├── tournament-formats/   #   フォーマット管理
│   │   ├── teams/                #   チーム管理
│   │   ├── venues/               #   会場管理
│   │   ├── operators/            #   オペレーター管理
│   │   ├── sport-types/          #   競技種別管理
│   │   ├── matches/              #   試合管理
│   │   ├── results/              #   結果確認
│   │   └── ...                   #   その他（辞退管理、サブスクリプション等）
│   ├── auth/                     # 認証関連（ログイン/登録/パスワードリセット）
│   ├── my/                       # チーム代表者向け画面
│   ├── operators/                # オペレーター向け画面
│   ├── tournaments/              # 大会関連（参加登録、辞退申請等）
│   ├── qr/                       # QRコード関連
│   ├── referee/                  # 審判用結果入力（QR認証）
│   └── api/                      # API Routes（180+エンドポイント）
│       ├── auth/                 #   認証API（NextAuth）
│       ├── admin/                #   管理者専用API
│       ├── tournaments/          #   大会API（50+エンドポイント）
│       ├── matches/              #   試合API
│       ├── operators/            #   オペレーターAPI
│       ├── venues/               #   会場API
│       ├── sport-types/          #   競技種別API
│       ├── tournament-groups/    #   大会グループAPI
│       ├── sponsor-banners/      #   スポンサーバナーAPI
│       └── ...                   #   その他
│
├── components/                   # Reactコンポーネント
│   ├── ui/                       # shadcn/ui ベースコンポーネント
│   ├── admin/                    # 管理者画面用コンポーネント
│   ├── features/                 # 機能別コンポーネント（18カテゴリ）
│   ├── forms/                    # フォームコンポーネント
│   ├── layout/                   # レイアウトコンポーネント
│   ├── providers/                # Reactプロバイダー
│   ├── public/                   # 公開画面用コンポーネント
│   └── tables/                   # テーブルコンポーネント
│
├── lib/                          # ユーティリティ・ビジネスロジック（60+ファイル）
│   ├── auth.ts                   # NextAuth設定
│   ├── db.ts                     # Turso接続
│   ├── types.ts                  # TypeScript型定義（主要）
│   ├── score-parser.ts           # スコアデータ解析（JSON配列形式）
│   ├── standings-calculator.ts   # 順位表計算
│   ├── match-results-calculator.ts # 試合結果計算
│   ├── tournament-progression.ts # トーナメント進行ロジック
│   ├── tournament-promotion.ts   # 昇格・進出処理
│   ├── tie-breaking-calculator.ts # タイブレーク計算
│   ├── disciplinary-calculator.ts # 懲罰計算
│   ├── withdrawal-processor.ts   # 辞退処理
│   ├── schedule-calculator.ts    # スケジュール計算
│   ├── types/                    # 追加型定義（フェーズ、オペレーター等）
│   ├── api/                      # API共通ユーティリティ
│   ├── email/                    # メール送信
│   ├── subscription/             # サブスクリプション
│   ├── tournament-bracket/       # トーナメント表ロジック
│   └── archive-html/             # HTMLアーカイブ
│
├── hooks/                        # カスタムReact Hooks
├── types/                        # グローバル型定義
│   └── next-auth.d.ts            # NextAuth型拡張
│
├── data/                         # マスターデータ（JSON）
│   ├── venues.json               # 会場マスター
│   ├── tournament_formats.json   # 大会フォーマット
│   └── match_templates.json      # 試合テンプレート
│
├── scripts/                      # ユーティリティスクリプト（24ファイル）
│   ├── seed-master-data.js       # マスターデータ投入
│   ├── seed-prefectures.mjs      # 都道府県データ投入
│   └── migrate-*.ts              # 各種データマイグレーション
│
├── drizzle/                      # マイグレーションファイル（0000〜0034）
│
├── docs/                         # ドキュメント
│   ├── specs/                    # 技術仕様
│   │   ├── architecture.md       #   アーキテクチャ設計（本ファイル）
│   │   ├── database.md           #   データベース設計
│   │   ├── implementation-status.md  #   実装状況
│   │   └── tournament-bracket-logic.md  # トーナメント表ロジック
│   ├── features/                 # 機能仕様（28+ファイル）
│   │   └── implemented-features.md   # 実装済み機能一覧（索引）
│   ├── guides/                   # 開発ガイド
│   │   ├── onboarding.md         #   新規開発者ガイド
│   │   ├── development.md        #   開発環境セットアップ
│   │   ├── database-migration.md #   マイグレーションガイド
│   │   ├── drizzle-orm-guide.md  #   Drizzle ORM入門
│   │   ├── drizzle-seeder-guide.md  # Seederガイド
│   │   └── blob-setup-guide.md   #   Blob Storageセットアップ
│   ├── database/                 # データベース図
│   │   └── KSM.md                #   ER図（Mermaid記法、41テーブル）
│   └── design/                   # デザイン
│       └── uidesign-basic-policy.md  # UI設計方針
│
├── .github/                      # GitHub Actions CI設定
├── .husky/                       # Git hooks
├── .storybook/                   # Storybook設定
├── stories/                      # Storybookストーリー
└── public/                       # 静的ファイル
```

