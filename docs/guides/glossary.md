# 用語集

KSM-Appプロジェクトで使用される業務用語・技術用語の一覧です。
コードを読む際やドキュメントを理解する際の参考にしてください。

## 業務用語

### 大会運営の基本用語

| 用語 | 英語 / コード上の名称 | 説明 |
|------|---------------------|------|
| **大会** | Tournament Event / `TournamentGroup` | 1つのイベント全体（例:「第5回PK選手権」）。DB: `t_tournament_groups` |
| **部門** | Division / `Tournament` | 大会内のカテゴリー（例:「一般の部」「ジュニアの部」）。DB: `t_tournaments` |
| **フォーマット** | Format / `TournamentFormat` | 試合形式のテンプレート（例: 8チーム2ブロック→決勝トーナメント）。DB: `m_tournament_formats` |
| **テンプレート** | Match Template | フォーマット内の個々の試合定義。DB: `m_match_templates` |
| **フェーズ** | Phase | 大会の段階。`preliminary`（予選リーグ）または `final`（決勝トーナメント） |
| **ブロック** | Block / `MatchBlock` | 試合のグループ単位（例: Aブロック、Bブロック、決勝トーナメント）。DB: `t_match_blocks` |
| **マッチデー** | Matchday | リーグ戦の節（第1節、第2節...）。同じ節の試合は同時進行 |
| **サイクル** | Cycle | リーグ戦の巡回数（1巡目、2巡目...）。デフォルト1 |

### チーム・選手関連

| 用語 | 英語 / コード上の名称 | 説明 |
|------|---------------------|------|
| **マスターチーム** | Master Team | チームの基本情報。大会に依存しない。DB: `m_teams` |
| **大会参加チーム** | Tournament Team | 特定の大会に参加するチームエントリー。DB: `t_tournament_teams` |
| **tournament_team_id** | — | 大会内でチームを一意に識別するID。同一チームの複数エントリーを区別する |
| **チーム略称** | Team Omission | スコアボード等で使用する短い名前 |
| **登録種別** | Registration Type | `self_registered`（チーム自身が登録）/ `admin_proxy`（管理者が代行登録） |

### 試合関連

| 用語 | 英語 / コード上の名称 | 説明 |
|------|---------------------|------|
| **試合コード** | Match Code | 試合を識別するコード（例: A1, B2, T8, M1）。Aブロック1試合目、決勝トーナメント8試合目など |
| **team_source** | — | 試合に出場するチームの決定方法（例: `A_1` = Aブロック1位、`T1_winner` = T1試合の勝者） |
| **不戦勝** | Bye Match / Walkover | 対戦相手がいない試合。チーム数が奇数やブロック不均等の場合に発生 |
| **スコア** | Scores | JSON配列形式で保存（例: `[3, 2]` = 前半3点、後半2点）。`lib/score-parser.ts` で解析 |
| **結果確定** | Confirm | 管理者が試合結果を確認し、`t_matches_live` → `t_matches_final` に移行する操作 |
| **進出条件オーバーライド** | Match Override | チーム辞退等で通常の進出条件を変更する仕組み。DB: `t_tournament_match_overrides` |

### 辞退関連

| 用語 | 英語 / コード上の名称 | 説明 |
|------|---------------------|------|
| **辞退申請** | Withdrawal Request | チーム代表者が大会参加を取り消す申請 |
| **辞退ステータス** | Withdrawal Status | `active` → `withdrawal_requested` → `withdrawal_approved` / `withdrawal_rejected` |

### 懲罰関連

| 用語 | 英語 / コード上の名称 | 説明 |
|------|---------------------|------|
| **懲罰設定** | Disciplinary Settings | 大会グループ単位のカード累積ルール。DB: `t_disciplinary_settings` |
| **懲罰記録** | Disciplinary Action | 個々のカード記録（イエロー/レッド）。DB: `t_disciplinary_actions` |
| **累積閾値** | Yellow Threshold | イエローカードがこの枚数に達すると出場停止。デフォルト2 |

---

## 技術用語

### データベース

| 用語 | 説明 |
|------|------|
| **Turso** | リモートSQLiteデータベースサービス。libSQLプロトコルで接続 |
| **Drizzle ORM** | TypeScript製ORM。本プロジェクトではスキーマ定義とマイグレーション生成に使用。ランタイムクエリは生SQL |
| **`m_` プレフィックス** | マスターテーブル（永続的な基本データ）。例: `m_teams`, `m_venues` |
| **`t_` プレフィックス** | トランザクションテーブル（大会・操作に紐づくデータ）。例: `t_tournaments`, `t_matches_live` |
| **JST** | 日本標準時。全タイムスタンプは `datetime('now', '+9 hours')` でJST保存 |

### 認証・権限

| 用語 | 説明 |
|------|------|
| **NextAuth.js** | 認証ライブラリ。Credentials Provider（メール/パスワード）を使用 |
| **m_login_users** | 統合ログインユーザーテーブル。管理者・オペレーター・チーム代表者すべてがここに登録 |
| **m_login_user_roles** | ユーザーのロール（`admin` / `operator` / `team`）を管理 |
| **オペレーター権限** | 18種類の個別権限。大会ごとに `t_operator_tournament_access` で管理 |
| **Superadmin** | `m_login_users.is_superadmin = 1` のユーザー。非公開フォーマットへのアクセス等の追加権限 |

### フロントエンド

| 用語 | 説明 |
|------|------|
| **App Router** | Next.js 15のルーティング方式。`app/` ディレクトリでファイルベースルーティング |
| **Server Component** | サーバー側で実行されるReactコンポーネント。`page.tsx` はデフォルトでServer Component |
| **Client Component** | `"use client"` ディレクティブ付きのコンポーネント。ブラウザで実行 |
| **shadcn/ui** | Radix UIベースのUIコンポーネントライブラリ。`components/ui/` に配置 |
| **SSE** | Server-Sent Events。試合のリアルタイム更新に使用 |

### ストレージ

| 用語 | 説明 |
|------|------|
| **Vercel Blob** | ファイルストレージサービス。大会PDF・ロゴ画像・アーカイブHTMLを保存 |
| **archive_ui_version** | アーカイブ時のUI版数。将来UIが変わっても過去のアーカイブは当時のUIで表示 |

---

## コード上の命名と画面表示の対応

| コード / DB | 画面上の日本語表示 | 備考 |
|------------|-------------------|------|
| `TournamentGroup` / `t_tournament_groups` | 大会 | 「大会グループ」から「大会」に用語変更済み |
| `Tournament` / `t_tournaments` | 部門 / コース | 「大会」から「部門」に用語変更済み |
| `TournamentTeam` / `t_tournament_teams` | 参加チーム | 大会エントリー単位 |
| `MatchBlock` / `t_match_blocks` | ブロック | 予選A/B/C/D、決勝トーナメント |
| `Match` / `t_matches_live` | 試合 | 進行中の試合 |
| `Match` / `t_matches_final` | 確定済み試合 | 結果確定後の試合 |
| `team_rankings` (JSON) | 順位表 | `t_match_blocks` に事前計算して保存 |
| `visibility: 'draft'` | 下書き | 公開設定 |
| `visibility: 'preparing'` | 準備中 | 公開設定 |
| `visibility: 'public'` | 公開中 | 公開設定 |
| `participation_status: 'confirmed'` | 参加確定 | チーム参加ステータス |
| `withdrawal_status: 'active'` | 参加中 | 辞退ステータス |

---

## 型エイリアス（`lib/types.ts`）

```typescript
export type TournamentEvent = TournamentGroup;  // 大会
export type Division = Tournament;               // 部門
```

コードを読む際、`Tournament` が「部門」を指し、`TournamentGroup` が「大会」を指す点に注意してください。
この用語変更は開発途中で行われたため、一部のコードやコメントには旧い用語が残っている場合があります。
