# データベースマイグレーション履歴

このファイルには、データベーススキーマの変更履歴を記録します。

## マイグレーション記録ルール

各マイグレーション実行時に以下の情報を記録してください：

- **日付**: マイグレーション実行日
- **環境**: dev/stag/main
- **方法**: db:push / db:migrate / 手動スクリプト
- **変更内容**: 何を変更したか（テーブル名、カラム名、理由）
- **影響範囲**: どのファイルを修正したか
- **スクリプト**: 使用したスクリプトファイルのパス（該当する場合）
- **スナップショット**: Drizzleのスナップショット番号（該当する場合）

---

## 0026: 旧チームログイン機能の完全削除 & m_teams.password_hash 除去（2026-03-12）

### 基本情報
- **日付**: 2026年3月12日
- **環境**: dev（stag/mainは要実行）
- **方法**: カスタムマイグレーションスクリプト
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0026_remove_team_password_hash.sql`
- **実行スクリプト**: `scripts/migrate-0026-remove-team-password-hash.ts`

### 変更内容

#### `m_teams` テーブル
- `password_hash` カラム削除

#### `t_password_reset_tokens` テーブル
- `team_id` カラム削除
- `login_user_id` カラム追加（`m_login_users.login_user_id` への外部キー）

### 変更理由
ログイン機能が `m_login_users` テーブルに一本化されたため、旧チーム代表者ログイン（`m_teams.password_hash` + teamId/password認証）は不要になった。パスワードリセットも `m_login_users` 経由に移行。

### 影響を受けたファイル
- `src/db/schema.ts` - mTeams.passwordHash削除、tPasswordResetTokens.teamId→loginUserId
- `src/db/relations.ts` - tPasswordResetTokensRelationsをmLoginUsersに変更
- `drizzle/schema.ts` - 生成スキーマの同期
- `lib/auth.ts` - "team"プロバイダー削除
- `middleware.ts` - /teamルート保護削除
- `app/api/auth/forgot-password/route.ts` - m_login_users対応に書き換え
- `app/api/auth/reset-password/route.ts` - m_login_users対応に書き換え
- `app/api/admin/tournaments/[id]/teams/route.ts` - password_hash書き込み削除、m_login_users作成追加
- `app/auth/forgot-password/page.tsx` - teamId入力欄削除
- `app/auth/reset-password/page.tsx` - チーム情報表示→ユーザー情報表示
- `app/auth/admin/login/page.tsx` - チームログインリンク削除
- 各ページのリダイレクト先を `/auth/team/login` → `/auth/login`、`/team` → `/my` に変更

### 削除されたファイル（10ファイル）
- `app/team/page.tsx` - 旧チームダッシュボード
- `app/auth/team/login/page.tsx` - 旧チームログインページ
- `components/features/team/TeamProfile.tsx`
- `components/features/team/TeamTournaments.tsx`
- `components/features/team/TeamMembers.tsx`
- `app/api/teams/profile/route.ts`
- `app/api/teams/tournaments/route.ts`
- `app/api/teams/players/route.ts`
- `app/api/teams/register/route.ts`

### 実行コマンド
```bash
npx tsx scripts/migrate-0026-remove-team-password-hash.ts          # dev環境
npx tsx scripts/migrate-0026-remove-team-password-hash.ts stag     # stag環境
npx tsx scripts/migrate-0026-remove-team-password-hash.ts main     # main環境
```

---

## 0025: preliminary_format_type / final_format_type カラム削除（2026-03-12）

### 基本情報
- **日付**: 2026年3月12日
- **環境**: dev（stag/mainは要実行）
- **方法**: バックフィルスクリプト → カスタムマイグレーションスクリプト
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0025_drop_format_type_legacy.sql`

### 変更内容

#### `m_tournament_formats` テーブル
- `preliminary_format_type` カラム削除
- `final_format_type` カラム削除

#### `t_tournaments` テーブル
- `preliminary_format_type` カラム削除
- `final_format_type` カラム削除

### 変更理由
`phases` JSONフィールドへの移行が完了し、全てのビジネスロジック（ブロック生成、フェーズ解決、テンプレートマッピング等）は既に`phases`を使用している。UIフォーム・API・型定義からレガシーフィールドへの参照を除去し、`phases`を唯一のソースにする。

### 実行手順
1. `npx tsx scripts/backfill-phases-from-legacy.ts` - phases IS NULLのレコードをバックフィル
2. `npx tsx scripts/migrate-0025-drop-format-type-legacy.ts` - カラム削除
3. stag/main環境でも同様に実行

### 影響を受けたファイル
- `src/db/schema.ts` - 2テーブルから2フィールドずつ削除
- `lib/types.ts` - Tournament interfaceから2フィールド削除
- `components/features/tournament-format/TournamentFormatCreateForm.tsx` - phases直接更新に変更
- `components/features/tournament-format/TournamentFormatEditForm.tsx` - phases直接更新に変更
- `app/api/admin/tournament-formats/route.ts` - SELECT/INSERT/GROUP BYから除去
- `app/api/admin/tournament-formats/[id]/route.ts` - UPDATE/destructuringから除去
- `app/api/tournaments/create-new/route.ts` - SELECT/UPDATEから除去
- `app/api/tournaments/create-league/route.ts` - SELECT/UPDATEから除去
- `app/api/admin/tournaments/[id]/change-format/route.ts` - SELECT/UPDATEから除去
- `app/api/tournaments/[id]/route.ts` - SELECT/マッピングから除去

---

## 0022: 会場マスタのオーナー管理・共有フラグ対応（2026-03-11）

### 基本情報
- **日付**: 2026年3月11日
- **環境**: dev
- **方法**: カスタムマイグレーター（`scripts/migrate-turso.ts`）
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0022_venue_ownership.sql`

### 変更内容

#### `m_venues` テーブル拡張
- `created_by_login_user_id` INTEGER - 会場を作成した管理者のlogin_user_id
- `is_shared` INTEGER NOT NULL DEFAULT 0 - 共有フラグ（1: 全ユーザーに公開）

#### データ移行
- 既存会場は全て `is_shared = 1` に設定（後方互換性維持）
- 既存会場の `created_by_login_user_id` は NULL（superadminのみ編集・削除可能）

### 影響を受けたファイル
- `src/db/schema.ts` - mVenues に2カラム追加
- `drizzle/0022_venue_ownership.sql` - マイグレーションSQL
- `drizzle/meta/_journal.json` - エントリ追加
- `app/api/venues/route.ts` - GET: scopeパラメータ追加 / POST: オーナー設定
- `app/api/venues/[id]/route.ts` - GET/PUT/DELETE: 権限チェック + レスポンス拡張
- `app/admin/venues/page.tsx` - props追加（loginUserId, isSuperadmin）
- `components/features/admin/VenueManagement.tsx` - props受取・スコープ取得・共有UI
- `components/features/tournament/TournamentCreateNewForm.tsx` - fetch URL変更（scope=available）
- `components/forms/TournamentEditForm.tsx` - fetch URL変更（scope=available）
- `components/features/tournament/TournamentGroupCreateForm.tsx` - fetch URL変更（scope=available）
- `components/features/tournament/TournamentGroupEditForm.tsx` - fetch URL変更（scope=available）
- `lib/types.ts` - Venue型拡張

---

## 0021: 複数会場対応 - venue_id JSON配列化・会場マスタ地図情報追加・試合テーブル拡張（2026-03-10）

### 基本情報
- **日付**: 2026年3月10日
- **環境**: dev
- **方法**: カスタムマイグレーター（`scripts/migrate-turso.ts`）+ 手動スクリプト
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0021_multi_venue_support.sql`

### 変更内容

#### 1. `m_venues` テーブル拡張
- `google_maps_url` (TEXT) - Google Maps URL
- `latitude` (REAL) - 緯度
- `longitude` (REAL) - 経度

#### 2. `t_tournaments.venue_id` INTEGER → TEXT（JSON配列）
- `venue_id` を `venue_id_legacy` にリネーム（旧FK制約付きINTEGER）
- 新しい `venue_id` カラムをTEXT型で追加（JSON配列 例: `"[1, 3]"`）
- 既存データを `UPDATE t_tournaments SET venue_id = '[' || venue_id_legacy || ']'` で変換
- SQLiteのFK制約回避のためRENAME COLUMN + ADD COLUMNアプローチを採用

#### 3. `t_matches_live` / `t_matches_final` テーブル拡張
- `court_name` (TEXT) - コート名
- `venue_id` (INTEGER) - 会場ID

#### 4. `t_tournament_courts` テーブル拡張
- `venue_id` (INTEGER) - 会場ID

### 変更理由
- 1日目A会場・2日目B会場のように複数会場を使う大会に対応
- 会場マスタに地図情報を追加し、参加者への会場案内を改善
- 試合テーブルにコート名・会場IDを追加し、コート別・会場別の試合管理を実現

### 影響を受けたファイル

#### スキーマ・型定義
- `src/db/schema.ts` - m_venues拡張、venue_id TEXT化、matches拡張、courts拡張
- `src/db/relations.ts` - venue_idリレーション削除
- `lib/types.ts` - Tournament.venue_id: number → string|null、Venue地図フィールド追加、parseVenueIds()ヘルパー追加

#### 会場マスタAPI・UI
- `app/api/venues/route.ts` - 地図フィールド対応（GET/POST）
- `app/api/venues/[id]/route.ts` - 地図フィールド対応（GET/PUT）、削除チェックをjson_each対応
- `components/features/admin/VenueManagement.tsx` - 地図フィールドUI追加

#### venue_id JOIN更新（JSON_EXTRACT対応）- 25+ファイル
- `app/api/tournaments/route.ts`
- `app/api/tournaments/[id]/route.ts`
- `app/api/tournaments/search/route.ts`
- `app/api/tournaments/public/route.ts`
- `app/api/tournaments/dashboard/route.ts`
- `app/api/tournaments/create-new/route.ts`
- `app/api/tournaments/create-league/route.ts`
- `app/api/admin/tournaments/route.ts`
- `app/api/admin/tournaments/active/route.ts`
- `app/api/admin/tournaments/duplicate/route.ts`
- `app/api/admin/tournaments/[id]/teams/route.ts`
- `app/api/operators/tournaments/route.ts`
- `app/api/teams/tournaments/route.ts`
- `app/api/teams/profile/route.ts`
- `app/api/my/tournaments/[tournament_id]/apply/route.ts`
- `app/api/my/teams/[id]/tournaments/route.ts`
- `app/api/my/teams/[id]/tournaments/past/route.ts`
- `app/api/my/teams/[id]/tournaments/[tournament_team_id]/withdraw/route.ts`
- `app/api/tournaments/[id]/join/route.ts`
- `app/api/tournaments/[id]/results/html/route.ts`
- `app/api/tournaments/public-groups/[id]/route.ts`
- `app/api/admin/withdrawal-requests/route.ts`
- `app/api/admin/withdrawal-requests/[id]/route.ts`
- `app/tournaments/[id]/teams/page.tsx`
- `lib/tournament-detail.ts`
- `lib/dashboard-data.ts`
- `lib/api/tournaments.ts`
- `lib/tournament-json-archiver.ts`
- `lib/withdrawal-notifications.ts`
- `app/admin/tournaments/[id]/edit/page.tsx`
- `app/admin/tournaments/[id]/results/page.tsx`
- `app/admin/tournaments/[id]/manual-rankings/page.tsx`

#### 部門作成・編集フォーム
- `components/features/tournament/TournamentCreateNewForm.tsx` - 複数会場Popover UI、コート数自動導出
- `components/forms/TournamentEditForm.tsx` - 複数会場Popover UI
- `app/api/tournaments/create-new/route.ts` - venue_ids配列受け取り、JSON保存
- `app/api/tournaments/[id]/route.ts` - PUT: venue_ids配列受け取り

#### スケジュールプレビュー
- `components/features/tournament/SchedulePreview.tsx` - コート別表示、コート編集機能削除

#### 新規ファイル
- `components/ui/popover.tsx` - shadcn/ui Popoverコンポーネント
- `app/admin/tournaments/[id]/court-venue-settings/page.tsx` - 会場・コート設定画面
- `app/api/tournaments/[id]/court-venue-settings/route.ts` - 会場・コート設定API

#### ダッシュボード
- `components/features/my/MyDashboardTabs.tsx` - 「会場・コート設定」ボタン追加

---

## 0020: t_tournament_rulesのphase CHECK制約を削除 - フェーズ可変対応（2026-03-08）

### 基本情報
- **日付**: 2026年3月8日
- **環境**: dev（未適用）
- **方法**: カスタムマイグレーター（`scripts/migrate-turso.ts`）
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0020_remove_phase_check_constraint.sql`

### 変更内容
- `t_tournament_rules`テーブルの`phase`カラムのCHECK制約 `phase IN ('preliminary', 'final')` を削除
- SQLiteではALTER TABLEでCHECK制約を削除できないため、テーブル再作成方式で対応
- フェーズIDが`phases` JSONの任意の値を取れるようになる（例: `preliminary_1`, `league_round` 等）

### 変更理由
- 大会フォーマットの`phases` JSONで定義される任意のフェーズIDを`t_tournament_rules`に登録できるようにするため
- 従来は「予選」と「決勝」の2フェーズ固定だったが、3フェーズ以上の大会構成に対応

### 影響を受けたファイル
- `src/db/schema.ts` - CHECK制約行を削除
- `lib/tournament-rules.ts` - `TournamentRule.phase`型を`string`に変更
- `app/api/tournaments/[id]/rules/route.ts` - phase型キャストを修正
- `components/features/tournament-rules/TournamentRulesForm.tsx` - フェーズカードを動的生成に変更
- `drizzle/meta/_journal.json` - エントリ追加

---

## 0018: venue_nameをt_matches_liveに追加 - リーグ戦の試合別会場対応（2026-03-06）

### 基本情報
- **日付**: 2026年3月6日
- **環境**: dev
- **方法**: カスタムマイグレーター（`scripts/migrate-turso.ts`）
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0018_add_venue_name_to_matches.sql`

### 変更内容
- `t_matches_live` に `venue_name` (TEXT, NULLable) カラムを追加
- リーグ戦では試合ごとに会場が異なるため、試合単位で会場名を保持する

### 影響を受けたファイル
- `src/db/schema.ts` - tMatchesLive に venueName 追加
- `drizzle/0018_add_venue_name_to_matches.sql` - 新規
- `drizzle/meta/_journal.json` - エントリ追加
- `app/api/tournaments/[id]/matchday-settings/route.ts` - GET/PUT で venue_name 対応
- `components/features/tournament/MatchdaySettingsForm.tsx` - 会場選択UI追加

### 実行コマンド
```bash
npm run db:migrate
```

---

## 0017: format_nameをt_tournamentsに追加 - マスターテーブルJOIN削減（2026-03-05）

### 基本情報
- **日付**: 2026年3月5日
- **環境**: dev
- **方法**: カスタムマイグレーター（`scripts/migrate-turso.ts`）
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0017_add_format_name_to_tournaments.sql`

### 変更の背景と目的

テンプレート独立化の一環として、`m_tournament_formats`テーブルからformat_nameを取得するための
JOINが30箇所以上に存在していた。format_nameをt_tournamentsに直接保持することで、
マスターテーブルへの依存をさらに削減し、クエリのパフォーマンスを改善する。

### 変更内容

#### t_tournaments に1カラム追加
- `format_name` (TEXT) - フォーマット名（m_tournament_formatsからコピー）

#### データバックフィル
- マイグレーションSQL内で既存データをm_tournament_formatsから一括コピー

### 影響を受けたファイル

#### スキーマ・マイグレーション
- `src/db/schema.ts` - formatNameカラム追加
- `drizzle/0017_add_format_name_to_tournaments.sql` - 新規
- `drizzle/meta/_journal.json` - エントリ追加

#### INSERT/UPDATE時のformat_nameコピー処理追加
- `app/api/tournaments/create-new/route.ts`
- `app/api/tournaments/route.ts` (POST)
- `app/api/admin/tournaments/[id]/change-format/route.ts`
- `app/api/admin/tournaments/duplicate/route.ts`
- `scripts/duplicate-tournament.ts`
- `scripts/duplicate-tournament-batch.ts`

#### JOIN削除・t.format_nameへの切り替え（約30ファイル）
- `app/api/tournaments/public-grouped/route.ts`
- `app/api/tournaments/dashboard/route.ts`
- `app/api/teams/tournaments/route.ts`
- `app/api/tournaments/route.ts`
- `app/api/tournament-groups/[id]/route.ts`
- `lib/api/tournaments.ts`
- `lib/dashboard-data.ts`
- `app/api/tournaments/search/route.ts`
- `app/api/tournaments/public/route.ts`
- `app/api/admin/tournaments/active/route.ts`
- `app/api/admin/withdrawal-requests/route.ts`
- `app/api/admin/withdrawal-requests/[id]/process/route.ts`
- `app/api/tournaments/public-groups/[id]/route.ts`
- `app/api/admin/tournaments/route.ts`
- `app/api/admin/tournaments/[id]/teams/route.ts`
- `app/api/admin/tournaments/[id]/participants/route.ts`
- `app/api/tournaments/[id]/route.ts`
- `app/api/operators/tournaments/route.ts`
- `lib/tournament-detail.ts`

#### JOINを維持（format_name以外の情報が必要なため）
- `app/api/tournaments/[id]/bracket/route.ts` - target_team_count取得
- `lib/tournament-json-archiver.ts` - target_team_count, format_description取得

---

## 0016: テンプレート独立化 - t_tournaments/t_matches_live/t_matches_finalにカラム追加（2026-03-04）

### 基本情報
- **日付**: 2026年3月4日
- **環境**: dev
- **方法**: カスタムマイグレーター（`scripts/migrate-turso.ts`）+ バックフィルスクリプト
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0016_template_independence.sql`
- **バックフィルスクリプト**: `scripts/backfill-template-data.ts`

### 変更の背景と目的

テンプレートを編集すると過去の大会の表示・動作に影響が出る問題を解消するため、
m_tournament_formats / m_match_templates のフィールドを t_tournaments / t_matches_live / t_matches_final にコピーする。

### 変更内容

#### t_tournaments に3カラム追加
- `preliminary_format_type` (TEXT) - 予選形式（league/tournament）
- `final_format_type` (TEXT) - 決勝形式
- `phases` (TEXT/JSON) - フェーズ構成

#### t_matches_live / t_matches_final に各16カラム追加
- `phase` (TEXT) - フェーズID
- `match_type` (TEXT) - 試合種別
- `round_name` (TEXT) - ラウンド名
- `block_name` (TEXT) - ブロック名
- `team1_source` / `team2_source` (TEXT) - 進出元
- `day_number` (INTEGER) - 日程番号
- `execution_priority` (INTEGER) - 実行順序
- `suggested_start_time` (TEXT) - 推奨開始時刻
- `loser_position_start` / `loser_position_end` (INTEGER) - 敗者順位範囲
- `position_note` (TEXT) - 順位注釈
- `winner_position` (INTEGER) - 勝者順位
- `is_bye_match` (INTEGER, DEFAULT 0) - 不戦勝フラグ
- `matchday` (INTEGER) - 節番号
- `cycle` (INTEGER, DEFAULT 1) - 巡目

### 影響を受けたファイル
- `src/db/schema.ts` - スキーマ定義
- `lib/types.ts` - 型定義
- `app/api/tournaments/create-new/route.ts` - 部門作成API
- `app/api/admin/tournaments/[id]/change-format/route.ts` - フォーマット変更API
- `app/api/matches/[id]/confirm/route.ts` - 試合確定処理

### 実行コマンド
```bash
npm run db:migrate
npx tsx scripts/backfill-template-data.ts dev
```

---

## 0015: m_match_templatesにリーグ戦対応カラムを追加（2026-03-04）

### 基本情報
- **日付**: 2026年3月4日
- **環境**: dev
- **方法**: カスタムマイグレーター（`scripts/migrate-turso.ts`）+ 手動SQL補完
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0015_add_matchday_and_cycle.sql`

### 変更の背景と目的

公式リーグ戦に対応するため、「節」（matchday）と「巡目」（cycle）の概念をm_match_templatesに追加する。
現在のシステムは1〜2日で全試合を完了する大会を想定しているが、リーグ戦では複数節にわたる開催となる。

例: 8チーム総当たり2巡の場合、7×2 = 14節が必要。

**ユースケース:**
- リーグ戦の節ごとの試合管理（第1節、第2節...）
- 総当たり何巡目かの管理（1巡目 vs 2巡目で同一対戦カード）

### 変更内容

**テーブル変更:**
- `m_match_templates` テーブル
  - `matchday` (INTEGER, NULL可) - 節番号（第1節=1, 第2節=2...）。入力は必須ではない
  - `cycle` (INTEGER, DEFAULT 1) - 巡目（総当たり何巡目か）

**型定義変更:**
- `lib/types/tournament-phases.ts` の `TournamentPhase` インターフェース
  - `total_cycles?: number` を追加（リーグ戦フェーズの総巡回数、デフォルト1）

### 影響範囲

**変更されたファイル:**
- `drizzle/0015_add_matchday_and_cycle.sql` (新規作成)
- `drizzle/meta/_journal.json` (エントリ追加)
- `src/db/schema.ts` (mMatchTemplatesにmatchday, cycle追加)
- `lib/types/tournament-phases.ts` (TournamentPhaseにtotal_cycles追加)
- `MIGRATION_HISTORY.md` (本ファイル)

### 備考
- `total_cycles` はm_tournament_formatsのphasesカラム（JSON）内で管理するため、DBスキーマ変更は不要
- 既存のフォーマットデータには影響なし（matchday=NULL, cycle=1がデフォルト）
- 将来的にリーグ戦用の部門作成画面を新設する際にこれらのフィールドを活用予定

---

## 0013: m_login_usersにロゴ関連カラムを追加（2026-02-23）

### 基本情報
- **日付**: 2026年2月23日
- **環境**: dev
- **方法**: 手動スクリプト + マイグレーションファイル作成
- **実行者**: Claude Code
- **スクリプト**: `scripts/add-logo-columns-to-login-users.mjs`
- **マイグレーションファイル**: `drizzle/0013_add_logo_columns_to_m_login_users.sql`

### 変更の背景と目的

管理者がアップロードした組織ロゴを大会カードに表示する機能を実装する。
当初はm_administratorsテーブルに保存していたが、大会データ取得時にm_login_usersテーブルとJOINするため、パフォーマンスと整合性の観点からm_login_usersテーブルに移行する。

**ユースケース:**
- マイダッシュボードの大会カードに組織ロゴを表示
- トップページの大会カードに組織ロゴを表示
- ロゴと組織名でどこが運営している大会かを一目で識別

**設計判断:**
- m_login_usersにカラム追加 vs 新規テーブル作成 → 前者を選択
  - 理由: 1ユーザー1ロゴのシンプルな関係、JOINなしで高速、既存のorganization_nameと統一

### 変更内容

**テーブル変更:**
- `m_login_users` テーブル
  - `logo_blob_url` (TEXT, NULL可) - Vercel Blob上のロゴURL
  - `logo_filename` (TEXT, NULL可) - ロゴファイル名
  - `organization_name` (TEXT, NULL可) - 組織名

**データ移行:**
- m_administratorsからm_login_usersにロゴデータを移行
- administrator_id = 2 のロゴを login_user_id = 10 に移行
  - ロゴURL: `https://qcxo81wusr3rxbxl.public.blob.vercel-storage.com/logos/2/logo-1758610765618.png`
  - 組織名: テスト管理機構

### 影響範囲

**変更されたファイル:**
- `drizzle/0013_add_logo_columns_to_m_login_users.sql` (新規作成)
- `drizzle/meta/_journal.json` (エントリ追加)
- `MIGRATION_HISTORY.md` (このエントリ)
- `app/api/admin/profile/logo/route.ts` (m_administrators → m_login_users)
- `lib/dashboard-data.ts` (NULL → a.logo_blob_url)
- `components/features/my/MyDashboardTabs.tsx` (ロゴ表示追加)
- `scripts/add-logo-columns-to-login-users.mjs` (カラム追加スクリプト)
- `scripts/migrate-logo-data.mjs` (データ移行スクリプト)
- `scripts/fix-logo-migration-correct.mjs` (正しいユーザーへの移行)

### 実行コマンド

```bash
# Dev環境
node scripts/add-logo-columns-to-login-users.mjs
node scripts/fix-logo-migration-correct.mjs

# Stag/Main環境（将来実行）
npm run db:migrate:stag  # または npm run db:migrate:main
```

### 注意事項
- m_administratorsテーブルのlogo_blob_url, logo_filename, organization_nameカラムは残存
- 既存のロゴファイルは移行せず、URLのみコピー
- 今後のロゴ更新はm_login_usersテーブルで管理

---

## 0014: t_operator_tournament_accessにassigned_by_login_user_idを追加（2026-03-01）

### 基本情報
- **日付**: 2026年3月1日
- **環境**: stag, main
- **方法**: マイグレーションファイル + 手動スクリプト
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0014_add_assigned_by_login_user_id.sql`
- **スクリプト**: `scripts/add-assigned-by-column-stag.ts`, `scripts/add-index-stag.ts`, `scripts/migrate-0014-to-main.ts`

### 変更の背景と目的

staging環境のt_operator_tournament_accessテーブルに、dev環境では既に存在する`assigned_by_login_user_id`カラムが存在していなかったため、dev環境との整合性を保つために追加する。

**背景:**
- 0012マイグレーションでdev環境にはassigned_by_login_user_idカラムが追加済み
- staging環境にはこのカラムが存在せず、環境間の不整合が発生
- 運営者管理機能の正常動作のため、staging環境にも同じスキーマを適用する必要があった

### 変更内容

**テーブル変更:**
- `t_operator_tournament_access` テーブル
  - `assigned_by_login_user_id` (INTEGER, NULL可) カラムを追加
  - 外部キー: `m_login_users.login_user_id` (ON DELETE SET NULL)
  - この部門アクセス権を付与した管理者のIDを記録
  - インデックス `idx_operator_access_assigned_by` を作成

### 影響範囲

**新規作成されたファイル:**
- `scripts/add-assigned-by-column-stag.ts` (カラム追加スクリプト)
- `scripts/add-index-stag.ts` (インデックス追加スクリプト)
- `scripts/check-stag-schema.ts` (スキーマ確認スクリプト)

**更新されたファイル:**
- `MIGRATION_HISTORY.md` (このエントリ)

### 実行コマンド

```bash
# Staging環境（手動スクリプト）
npx tsx scripts/add-assigned-by-column-stag.ts
npx tsx scripts/add-index-stag.ts

# Main環境（マイグレーションファイル適用）
npx tsx scripts/migrate-0014-to-main.ts
```

### SQLステートメント

```sql
-- カラム追加
ALTER TABLE t_operator_tournament_access
ADD COLUMN assigned_by_login_user_id INTEGER REFERENCES m_login_users(login_user_id) ON DELETE SET NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_operator_access_assigned_by
ON t_operator_tournament_access(assigned_by_login_user_id);
```

### 検証結果

**追加前:**
- staging/main環境: カラム数6個（access_id, operator_id, tournament_id, permissions, created_at, updated_at）
- assigned_by_login_user_id: 存在しない

**追加後（全環境）:**
- dev/stag/main環境: カラム数7個（assigned_by_login_user_idが追加）
- インデックス: idx_operator_access_assigned_by 追加済み
- 全環境のスキーマ整合性: 確認済み✅

### マイグレーションファイル

drizzle/0014_add_assigned_by_login_user_id.sql:
```sql
ALTER TABLE `t_operator_tournament_access`
ADD COLUMN `assigned_by_login_user_id` integer REFERENCES `m_login_users`(`login_user_id`) ON DELETE SET NULL;

CREATE INDEX `idx_operator_access_assigned_by` ON `t_operator_tournament_access` (`assigned_by_login_user_id`);
```

### 注意事項
- 既存レコードの `assigned_by_login_user_id` は NULL
- 今後の新規登録時に正確な値が設定される
- 全環境（dev/stag/main）に適用完了

---

## 0012: 部門アクセス権付与者の追跡機能（2026-02-22）

### 基本情報
- **日付**: 2026年2月22日
- **環境**: dev
- **方法**: カスタムマイグレーションスクリプト
- **実行者**: Claude Code
- **スクリプト**: `scripts/add-assigned-by-field.mjs`

### 変更の背景と目的

運営者が複数の管理者から部門アクセス権を付与される場合に、「誰がどの部門へのアクセスを許可したか」を追跡できるようにする。
これにより、マイダッシュボードで管理者別にグループ化された部門リストを表示可能になる。

**ユースケース:**
- 運営者Xが、A管理者とB管理者の両方から部門アクセス権を付与される
- マイダッシュボードで「A社主催」「B社主催」のように分類表示

**既存の制限:**
- `m_login_users.created_by_login_user_id`: アカウント作成者のみ記録（1人のみ）
- 追加で部門アクセス権を付与した管理者の情報が失われる

### 変更内容

**テーブル変更:**
- `t_operator_tournament_access` テーブル
  - `assigned_by_login_user_id` (INTEGER, NULL可) カラムを追加
  - 外部キー: `m_login_users.login_user_id` (ON DELETE SET NULL)
  - この部門アクセス権を付与した管理者のIDを記録
  - インデックス `idx_operator_access_assigned_by` を作成

**データ移行:**
- 既存レコードの `assigned_by_login_user_id` は `created_by_login_user_id` から推測して設定
- 今後の新規登録は正確な値が設定される

### 影響を受けたファイル

**スキーマ:**
- `src/db/schema.ts`: `tOperatorTournamentAccess` 定義を更新

**APIエンドポイント（4箇所）:**
- `app/api/admin/operators/assign-role/route.ts`: INSERT/UPDATE時に `assigned_by_login_user_id` を設定
- `app/api/operators/invite/accept/route.ts`: INSERT/UPDATE時に `invited_by_login_user_id` を使用
- `app/api/admin/operators/[id]/route.ts`: PUT時に `assigned_by_login_user_id` を設定
- `app/api/admin/operators/route.ts`: POST時に `assigned_by_login_user_id` を設定

**マイグレーションスクリプト:**
- `scripts/add-assigned-by-field.mjs`: カスタムマイグレーション

### 実行コマンド

```bash
node scripts/add-assigned-by-field.mjs
```

### フィールドの役割比較

| フィールド | 意味 | 更新頻度 | 用途 |
|-----------|------|----------|------|
| `m_login_users.created_by_login_user_id` | アカウントの作成者 | 1回のみ | ユーザー管理の責任者 |
| `t_operator_tournament_access.assigned_by_login_user_id` | 部門アクセス権の付与者 | 部門ごと | アクセス権の管理・表示 |

### 注意事項

- 既存データの `assigned_by_login_user_id` は推測値
- 今後の新規登録からは正確な値が記録される
- 管理者が削除されても、アクセス権は維持される（SET NULL）

---

## 0011: 運営者招待システム実装（2026-02-22）

### 基本情報
- **日付**: 2026年2月22日
- **環境**: dev
- **方法**: カスタムマイグレーション + カスタムマイグレーター
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0011_flat_black_tarantula.sql`

### 変更の背景と目的

運営者登録の仕組みを改善し、セキュリティとユーザー体験を向上させるため、招待メール方式を実装。
管理者がパスワードを決定する従来方式から、メールアドレス判定による自動分岐方式に変更。

**新方式のフロー:**
1. 管理者がメールアドレスを入力
2. システムが既存アカウントの有無を自動判定
3. 既存ユーザー → 即座にoperatorロール付与 + 通知メール送信
4. 新規ユーザー → 招待メール送信（7日間有効）

### 変更内容

**既存テーブル変更:**
- `m_login_users` テーブル
  - `created_by_login_user_id` (INTEGER) カラムを追加
  - 作成者（管理者）のlogin_user_idを記録
  - インデックス `idx_login_users_created_by` を作成

**新規作成テーブル:**
- `t_operator_invitations`: 運営者招待テーブル
  - `id` (PK, AUTOINCREMENT) — 招待ID
  - `email` (TEXT, NOT NULL) — 招待先メールアドレス
  - `invited_by_login_user_id` (INTEGER, NOT NULL) — 招待した管理者のID
  - `tournament_access` (TEXT, NOT NULL) — 部門と権限の配列（JSON形式）
  - `token` (TEXT, NOT NULL, UNIQUE) — 認証トークン（UUID）
  - `expires_at` (TEXT, NOT NULL) — 有効期限（7日間）
  - `status` (TEXT, DEFAULT 'pending') — 'pending' | 'accepted' | 'expired' | 'cancelled'
  - `accepted_by_login_user_id` (INTEGER) — 承諾後のユーザーID
  - `accepted_at` (TEXT) — 承認日時
  - `created_at` (TEXT) — 作成日時
  - インデックス: email, token, status, invited_by_login_user_id

### 影響範囲

**データベース:**
- `src/db/schema.ts` — スキーマ定義更新
- `drizzle/0011_flat_black_tarantula.sql` — マイグレーションファイル

**API (新規作成):**
- `app/api/admin/operators/check-email/route.ts` — メールアドレス確認API
- `app/api/admin/operators/assign-role/route.ts` — 既存ユーザーへのロール付与API
- `app/api/admin/operators/invite/route.ts` — 新規ユーザーへの招待API
- `app/api/operators/invite/accept/route.ts` — 招待受諾API

**API (修正):**
- `app/api/admin/operators/route.ts` — GET: 作成者でフィルタリング追加
- `app/api/admin/operators/[id]/route.ts` — GET/PUT/DELETE: 新スキーマ対応

**画面 (新規作成):**
- `app/operators/invite/accept/page.tsx` — 招待受諾画面（新規アカウント作成フォーム付き）
- `components/admin/operators/new-operator-form.tsx` — 新方式の運営者追加フォーム

**画面 (修正):**
- `app/admin/operators/new/page.tsx` — 新フォームコンポーネントに差し替え
- `app/admin/operators/page.tsx` — ダッシュボード戻るボタン修正（マイダッシュボードへ）
- `components/admin/operators/operator-list.tsx` — 「運営者を追加」ボタンに枠線追加

### 実行コマンド

```bash
npx drizzle-kit generate --custom  # カスタムマイグレーション生成
npm run db:migrate                 # マイグレーション適用（dev環境）
```

### 備考

- 既存の`m_operators`テーブルは使用せず、`m_login_users` + `m_login_user_roles`で統合管理
- 招待メールはnodemailer + Gmail SMTPで送信
- 通知メール（既存ユーザー）と招待メール（新規ユーザー）の2種類を実装
- 運営者一覧は作成者（created_by_login_user_id）でフィルタリングされ、管理者ごとに分離表示

---

## 0010: 都道府県マスタと会場地域機能の追加（2026-02-19）

### 基本情報
- **日付**: 2026年2月19日
- **環境**: dev
- **方法**: 手動SQLファイル作成 + カスタムマイグレーター
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0010_add_prefectures_and_venue_prefecture.sql`

### 変更の背景と目的

大会検索機能の実装に向けて、会場ベースの地域フィルタリングを可能にするため、
都道府県マスタテーブルを新設し、会場テーブルに地域情報を追加。
将来的にマイダッシュボードやTOP画面での大会検索に活用する。

### 変更内容

**新規作成テーブル:**
- `m_prefectures`: 都道府県マスタ
  - `prefecture_id` (PK) — JIS X 0401コード（1〜47）
  - `prefecture_name` — 都道府県名（例: "富山県"）
  - `prefecture_code` — JIS規格コード（例: "16"）
  - `region_name` — 地方区分（例: "中部"）
  - `display_order` — 表示順序
  - `is_active` — 有効/無効フラグ
  - `created_at` — 作成日時

**既存テーブル変更:**
- `m_venues` テーブル
  - `prefecture_id` カラムを追加（FK → m_prefectures）

**スキーマ変更:**
- `src/db/schema.ts` に `mPrefectures` テーブル定義を追加
- `src/db/schema.ts` の `mVenues` に `prefecture_id` 追加

**マスターデータ投入:**
- `scripts/seed-prefectures.mjs` — 47都道府県データの投入スクリプト
- 実行: `node scripts/seed-prefectures.mjs`

**API実装:**
- `app/api/prefectures/route.ts` — 都道府県マスタ取得API
- `app/api/my/teams/[id]/tournaments/route.ts` — 検索パラメータ（keyword, prefectureId, sportTypeId）対応

### 影響範囲

**新規作成ファイル:**
- `drizzle/0010_add_prefectures_and_venue_prefecture.sql`
- `scripts/seed-prefectures.mjs`
- `scripts/apply-migration-0010.mjs`（手動適用用）
- `app/api/prefectures/route.ts`

**変更ファイル:**
- `src/db/schema.ts` — m_prefectures追加、m_venues修正
- `app/api/my/teams/[id]/tournaments/route.ts` — 検索機能追加
- `drizzle/meta/_journal.json` — マイグレーション履歴に0010追加

### 実行手順

```bash
# 1. マイグレーション適用（手動）
node scripts/apply-migration-0010.mjs

# 2. 都道府県マスタデータ投入
node scripts/seed-prefectures.mjs
```

### 備考

- 会場が未定の大会は地域検索では表示されない仕様
- 将来的に大会グループや部門レベルでの地域情報追加も検討可能
- UI実装は別タスクで実施予定

---

## 0008: t_team_invitations テーブルの新設（2026-02-18）

### 基本情報
- **日付**: 2026年2月18日
- **環境**: dev
- **方法**: 直接 SQLファイル作成 + カスタムマイグレーター
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0008_add_team_invitations.sql`

### 変更の背景と目的

チーム担当者の共同管理機能（2名体制）を実装するため、招待フローで使用する
`t_team_invitations` テーブルを新設。担当者が亡くなった・辞めた場合にも
もう1人が継続して管理できるようにする。

### 変更内容

**新規作成テーブル:**
- `t_team_invitations`: チーム担当者招待トークン管理
  - `id` (PK, autoincrement)
  - `team_id` (FK → m_teams, cascade)
  - `invited_by_login_user_id` (FK → m_login_users, cascade)
  - `invited_email` — 招待先メールアドレス
  - `token` (UNIQUE) — 招待トークン（UUID）
  - `status` — "pending" | "accepted" | "cancelled"
  - `expires_at` — 有効期限（72時間）
  - `accepted_at` — 承認日時
  - `created_at`

**スキーマ変更:**
- `src/db/schema.ts` に `tTeamInvitations` テーブル定義を追加

### 影響を受けたファイル

- `src/db/schema.ts`
- `drizzle/0008_add_team_invitations.sql`
- `drizzle/meta/_journal.json`
- `app/api/teams/register/route.ts` — チーム作成時に m_team_members へ自動登録
- `app/api/my/teams/route.ts` — チーム一覧取得API（新設）
- `app/api/my/teams/[id]/managers/route.ts` — 担当者一覧API（新設）
- `app/api/my/teams/invite/route.ts` — 招待送信・一覧・キャンセルAPI（新設）
- `app/api/my/teams/invite/accept/route.ts` — 招待承認API（新設）
- `app/api/admin/teams/[id]/transfer-owner/route.ts` — 管理者用担当者変更API（新設）
- `components/features/my/MyDashboardTabs.tsx` — チームタブを実装
- `app/my/teams/[id]/page.tsx` — チーム管理画面（新設）
- `app/my/teams/invite/accept/page.tsx` — 招待承認ページ（新設）
- `app/admin/teams/[id]/page.tsx` — 管理者用担当者変更画面（新設）

### 実行コマンド

```bash
npm run db:migrate
```

---

## 0007: t_tournament_groups に login_user_id を追加（2026-02-17）

### 基本情報
- **日付**: 2026年2月17日
- **環境**: dev
- **方法**: 直接 ALTER TABLE + マイグレーションファイル手動作成
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0007_add_login_user_id_to_tournament_groups.sql`

### 変更の背景と目的

`t_tournament_groups.admin_login_id` は `m_administrators` テーブルへの外部キー制約があり、新プロバイダー（`m_login_users` ベース）でログインしたユーザーが大会を作成すると `FOREIGN KEY constraint failed` エラーが発生していた。

将来的に `m_administrators` テーブルを廃止するにあたり、`m_login_users` を直接参照する `login_user_id` カラムを追加。新プロバイダーでのユーザーは `login_user_id` ベースでフィルタリング・カウントを行う。

### 変更内容

**`t_tournament_groups` テーブル（カラム追加）**
```sql
ALTER TABLE t_tournament_groups ADD COLUMN login_user_id INTEGER REFERENCES m_login_users(login_user_id);
```

**既存データのバックフィル（3件）**
- `m_administrators.email` と `m_login_users.email` のマッチで `login_user_id` を埋めた

### 影響を受けたファイル

- `src/db/schema.ts` - tTournamentGroups に loginUserId フィールドを追加
- `drizzle/0007_add_login_user_id_to_tournament_groups.sql` - マイグレーションSQL
- `drizzle/meta/_journal.json` - ジャーナルにエントリ追加
- `app/api/tournament-groups/route.ts` - GET/POST の両方を新・旧プロバイダー両対応に修正
- `lib/subscription/subscription-service.ts` - `recalculateUsage()` / `checkTrialExpiredPermission()` を login_user_id ベースに修正
- `lib/subscription/plan-checker.ts` - `canEditTournamentGroup()` / `canChangePlan()` のクエリを login_user_id ベースに修正

---

## 0006: m_login_users に current_plan_id を追加（2026-02-17）

### 基本情報
- **日付**: 2026年2月17日
- **環境**: dev
- **方法**: 直接 ALTER TABLE + マイグレーションファイル手動作成
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0006_add_current_plan_id_to_login_users.sql`

### 変更の背景と目的

マイダッシュボードでプラン情報を表示するため、`m_login_users` テーブルにサブスクリプションプランの参照フィールドを追加。
現時点では全ユーザーがフリープラン（plan_id=1）となるため、管理者権限付与時に自動的にフリープランを設定する。
将来的に `m_administrators` テーブルを廃止する際の移行先として機能する。

### 変更内容

**`m_login_users` テーブル（カラム追加）**
```sql
ALTER TABLE m_login_users ADD COLUMN current_plan_id INTEGER REFERENCES m_subscription_plans(plan_id);
```

### 影響を受けたファイル

- `src/db/schema.ts` - mLoginUsers に currentPlanId フィールドを追加
- `drizzle/0006_add_current_plan_id_to_login_users.sql` - マイグレーションSQL
- `drizzle/meta/_journal.json` - ジャーナルにエントリ追加
- `app/api/administrators/route.ts` - 新規ユーザー作成時にフリープラン（plan_id=1）を設定
- `app/api/administrators/add-role/route.ts` - 既存ユーザーへのロール付与時にフリープランを設定（未設定の場合のみ）

---

## 0005: 統合ログインユーザー管理テーブル追加（2026-02-17）

### 基本情報
- **日付**: 2026年2月17日
- **環境**: dev
- **方法**: 手動マイグレーション（`drizzle/0005_add_login_users.sql`）+ 直接CREATE TABLE
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0005_add_login_users.sql`

### 変更の背景と目的

**設計目標:**
- ロールごとに分かれていたログイン（m_administrators / m_operators / m_teams）を1つに統合
- メールアドレスを単一のログイン識別子とする
- 複数ロールの兼任を許容（例：admin兼operator）
- チーム代表者を複数人（主担当・副担当）で管理できる設計

**解決する問題:**
- 管理者がチーム代表者も兼任する場合、ログアウト→再ログインが不要になる
- 将来的なロール追加に対応できる拡張性

### 変更内容

#### テーブル追加（4テーブル）

**m_login_users（統合ログインユーザー）:**
- `login_user_id` INTEGER PRIMARY KEY AUTOINCREMENT
- `email` TEXT UNIQUE NOT NULL - ログイン識別子
- `password_hash` TEXT NOT NULL
- `display_name` TEXT NOT NULL
- `is_superadmin` INTEGER DEFAULT 0 - 開発者専用スーパーユーザーフラグ
- `is_active` INTEGER DEFAULT 1
- `created_at` / `updated_at`

**m_login_user_roles（ユーザーロール）:**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `login_user_id` INTEGER FK → m_login_users (cascade)
- `role` TEXT - "admin" | "operator" | "team"
- `created_at`

**m_login_user_authority（大会スコープ権限）:**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `login_user_id` INTEGER FK → m_login_users (cascade)
- `tournament_id` INTEGER FK → t_tournaments (cascade)
- `permissions` TEXT (JSON: 既存OperatorPermissions 12項目と同じ形式)
- `created_at` / `updated_at`

**m_team_members（チーム担当者紐付け）:**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `team_id` TEXT FK → m_teams (cascade)
- `login_user_id` INTEGER FK → m_login_users (cascade)
- `member_role` TEXT DEFAULT 'primary' - "primary" | "secondary"
- `is_active` INTEGER DEFAULT 1
- `created_at` / `updated_at`

### 認証フロー変更

- NextAuth に新 CredentialsProvider `"login"` を追加（email + password）
- 既存Provider（admin/operator/team）は段階的移行のため維持
- `lib/auth.ts` で `roles[]` 配列と `isSuperadmin` フラグをセッションに格納
- `middleware.ts` を `roles[]` 配列対応に更新（後方互換維持）
- `types/next-auth.d.ts` の型定義を更新

### データ移行

- `scripts/migrate-admin-to-login-users.mjs` を作成・実行
- m_administrators の9件を m_login_users + m_login_user_roles に移行済み（dev環境）
- password_hash はそのまま流用（bcrypt形式で互換性あり）

### 影響ファイル
- `src/db/schema.ts` - 新テーブル4つ追加
- `drizzle/0005_add_login_users.sql` - マイグレーションSQL
- `drizzle/meta/_journal.json` - ジャーナル更新
- `lib/auth.ts` - NextAuth統合Provider追加
- `types/next-auth.d.ts` - 型定義更新
- `middleware.ts` - roles[]対応
- `app/auth/login/page.tsx` - 統合ログイン画面（新設）
- `scripts/migrate-admin-to-login-users.mjs` - データ移行スクリプト（新設）

---

## 0004: 大会運営者管理システム（部門単位アクセス制御）（2026-02-16）


### 基本情報
- **日付**: 2026年2月16日
- **環境**: dev
- **方法**: 手動マイグレーション（`drizzle/0004_familiar_cable.sql`）
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0004_familiar_cable.sql`

### 変更の背景と目的

**設計目標:**
- 管理者が運営者を登録し、部門単位でアクセス権と操作権限を付与できるシステム
- 部門ごとに異なる操作権限を設定可能（例: 部門Aは参加チーム管理のみ、部門Bは試合結果入力のみ）

**具体例:**
```
運営者A:
  - 部門100（一般）: 参加チーム管理のみON
  - 部門101（小学生）: 試合結果入力のみON
```

### 変更内容

#### テーブル追加

**m_operators（運営者マスター）:**
- `operator_id` INTEGER PRIMARY KEY AUTOINCREMENT
- `operator_login_id` TEXT UNIQUE NOT NULL - 運営者ログインID
- `password_hash` TEXT NOT NULL - パスワードハッシュ
- `operator_name` TEXT NOT NULL - 運営者名
- `administrator_id` INTEGER NOT NULL - 管理者ID（FK: m_administrators）
- `is_active` INTEGER DEFAULT 1 NOT NULL - 有効/無効
- `created_at` NUMERIC DEFAULT (datetime('now', '+9 hours'))
- `updated_at` NUMERIC DEFAULT (datetime('now', '+9 hours'))

**インデックス:**
- UNIQUE INDEX: `m_operators_operator_login_id_unique` (operator_login_id)
- INDEX: `idx_operators_admin` (administrator_id)
- INDEX: `idx_operators_login` (operator_login_id)

**t_operator_tournament_access（運営者部門アクセス権限）:**
- `access_id` INTEGER PRIMARY KEY AUTOINCREMENT
- `operator_id` INTEGER NOT NULL - 運営者ID（FK: m_operators, CASCADE DELETE）
- `tournament_id` INTEGER NOT NULL - 部門ID（FK: t_tournaments, CASCADE DELETE）
- `permissions` TEXT NOT NULL - 部門ごとの操作権限（JSON形式）
- `created_at` NUMERIC DEFAULT (datetime('now', '+9 hours'))
- `updated_at` NUMERIC DEFAULT (datetime('now', '+9 hours'))

**インデックス:**
- INDEX: `idx_operator_access_operator` (operator_id)
- INDEX: `idx_operator_access_tournament` (tournament_id)

### 影響範囲

#### データベーススキーマ
- `src/db/schema.ts`: テーブル定義更新

#### 型定義
- `lib/types/operator.ts`: 部門単位アクセス権限の型定義

#### APIエンドポイント
- `app/api/admin/operators/route.ts`: 運営者CRUD（新規作成）
- `app/api/admin/operators/[id]/route.ts`: 運営者詳細・更新・削除（新規作成）
- `app/api/admin/operators/[id]/toggle-active/route.ts`: 有効/無効切り替え（新規作成）
- `app/api/admin/tournaments/all/route.ts`: 全部門取得API（新規作成）

#### UIコンポーネント
- `components/admin/operators/operator-form.tsx`: 運営者登録フォーム（新規作成）
- `components/admin/operators/operator-list.tsx`: 運営者一覧（新規作成）
- `components/admin/operators/permission-editor.tsx`: 権限編集UI（新規作成）
- `components/admin/operators/tournament-access-selector.tsx`: 部門選択UI（新規作成）

#### ページ
- `app/admin/operators/page.tsx`: 運営者管理画面（新規作成）
- `app/admin/operators/new/page.tsx`: 運営者新規登録（新規作成）
- `app/admin/operators/[id]/edit/page.tsx`: 運営者編集（新規作成）

### 実行コマンド
```bash
# 1. 旧テーブルとマイグレーション履歴を削除
npx tsx scripts/drop-operator-tables.ts

# 2. 0004マイグレーションファイルを部門単位構造で書き直し済み

# 3. カスタムマイグレーター実行（Turso対応）
npm run db:migrate
```

### 実行結果
- ✅ m_operatorsテーブル作成成功
- ✅ t_operator_tournament_accessテーブル作成成功（部門単位アクセス）
- ✅ 全インデックス作成成功
- ✅ 外部キー制約設定完了
- ✅ __drizzle_migrationsに履歴記録完了

### 🎉 Turso対応カスタムマイグレーター導入
このマイグレーションから、Turso専用のカスタムマイグレーター（`scripts/migrate-turso.ts`）を使用開始。
標準の`drizzle-kit migrate`はTursoで以下の問題があったため：
- ブロックコメント（`/* */`）のパースエラー
- 複数SQL文の一括実行不可（Turso HTTPプロトコルの制限）

カスタムマイグレーターの特徴：
- ✅ ブロックコメントを自動削除
- ✅ SQL文を1つずつ実行（Turso対応）
- ✅ 既存テーブル/カラムのエラーを自動スキップ
- ✅ 環境別実行対応（dev/stag/main）
- ✅ 冪等性保証（何度実行しても安全）

### 影響を受けたファイル

#### 新規作成
- `src/lib/types/operator.ts` - TypeScript型定義（OperatorPermissions, Operator, OperatorFormDataなど）
- `drizzle/0004_familiar_cable.sql` - マイグレーションSQL
- `scripts/add-operator-tables.ts` - テーブル作成スクリプト

#### 更新
- `src/db/schema.ts` (Line 828-854) - 2テーブル追加

### 権限設計
運営者権限はJSON形式で以下の項目を管理：
- **matches**: 試合管理（組み合わせ作成、日程編集、結果入力、結果確定、結果編集）
- **publication**: 結果公開（結果公開、順位表管理）
- **communication**: コミュニケーション（メール送信、お知らせ管理）
- **others**: その他（統計閲覧、データエクスポート）

デフォルト権限（新規作成時）:
- 試合結果入力: ON
- 統計閲覧: ON
- その他: すべてOFF

### 今後の実装予定
- [ ] 運営者ログイン機能（NextAuth.js拡張）
- [ ] 運営者管理UI（大会詳細画面に「大会運営者の管理」ボタン追加）
- [ ] 運営者登録・編集フォーム
- [ ] 権限チェックミドルウェア
- [ ] アクセス制御の実装

---

## 0003: m_tournament_formatsにphasesフィールド追加（2026-02-09）

### 基本情報
- **日付**: 2026年2月9日
- **環境**: dev
- **方法**: 手動スクリプト（drizzle-kit migrateがSQLパースエラーのため）
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0003_rapid_stephen_strange.sql`

### 変更内容

#### テーブル変更
**m_tournament_formats:**
- `phases` TEXT (JSON形式) カラムを追加
- 既存の`preliminary_format_type`と`final_format_type`は維持（後方互換性）

#### データ変換
既存の16フォーマット全てで、`preliminary_format_type`と`final_format_type`から新しいJSON形式のphasesフィールドにデータを変換しました。

**変換例:**
```
Before:
  preliminary_format_type: "league"
  final_format_type: "tournament"

After:
  phases: {
    "phases": [
      {"id": "preliminary", "order": 1, "name": "予選", "format_type": "league"},
      {"id": "final", "order": 2, "name": "決勝トーナメント", "format_type": "tournament"}
    ]
  }
```

### 変更理由
- 現在の2フェーズ固定構造（予選・決勝）から、柔軟な複数フェーズ構造への移行
- 将来的に「1次予選→2次予選→3次予選→決勝」のような複雑な大会構成に対応
- テンプレート変更が既存大会に影響を与えないスナップショット方式の導入準備（Stage 1/3）

### 実行コマンド
```bash
# 1. スキーマ更新
npm run db:generate

# 2. マイグレーションSQL適用
npx tsx scripts/apply-phases-migration.mts

# 3. データ変換
npx tsx scripts/migrate-phases-field.mts

# 4. 検証
npx tsx scripts/verify-phases-migration.mts
```

### 実行結果
- ✅ phasesカラム追加成功
- ✅ 全16フォーマットのデータ変換成功
- ✅ 全16フォーマットの検証成功
- ✅ 既存フィールドとの整合性確認完了

### 影響を受けたファイル

#### 新規作成
- `lib/types/tournament-phases.ts` - TypeScript型定義
- `lib/tournament-phases.ts` - ヘルパー関数（11関数）
- `__tests__/lib/tournament-phases.test.ts` - ユニットテスト（53ケース）
- `scripts/apply-phases-migration.mts` - マイグレーション実行スクリプト
- `scripts/migrate-phases-field.mts` - データ変換スクリプト
- `scripts/verify-phases-migration.mts` - 検証スクリプト
- `drizzle/0003_rapid_stephen_strange.sql` - マイグレーションSQL

#### 更新
- `src/db/schema.ts` (Line 128-148) - phasesフィールド追加
- `package.json` - testスクリプト追加
- `vitest.config.ts` - ユニットテストプロジェクト追加
- `drizzle/0001_thankful_selene.sql` - SQLパースエラー対策のプレースホルダー追加
- `drizzle/meta/0002_snapshot.json` - IDとprevID修正
- `drizzle/meta/_journal.json` - 0003エントリ追加

### 後方互換性
- ✅ 既存の`preliminary_format_type`と`final_format_type`フィールドは維持
- ✅ 既存コードはそのまま動作
- ✅ 新しいコードは`phases`フィールドを優先し、なければ既存フィールドにフォールバック
- ✅ `getPhasesWithFallback()`関数で自動フォールバック対応

### 注意事項
- この変更は**Stage 1/3**です
- Stage 2で`t_tournaments`にphasesフィールドを追加予定（スナップショット実装）
- Stage 3で`t_matches_live`/`t_matches_final`に試合詳細フィールドを追加予定
- 現時点では既存フィールドを参照している既存コードは変更不要

### テスト結果
**ユニットテスト:**
- 53 tests passed (19ms)
- 全ヘルパー関数のテストカバレッジ: 100%

**データ変換:**
- Total formats: 16
- ✅ Migrated: 16
- ⏭️ Skipped: 0
- ❌ Errors: 0

**検証:**
- Total formats: 16
- ✅ Valid: 16
- ❌ Errors: 0

### 今後の予定
1. **Stage 2**: `t_tournaments`にphasesフィールド追加（スナップショット実装）
2. **Stage 3**: `t_matches_live`/`t_matches_final`に試合詳細フィールド追加
3. 動的UIタブ生成の実装
4. 既存コードの段階的移行

---

## 0002: マイグレーション管理体制の整備（2026-02-05）

### 基本情報
- **日付**: 2026年2月5日
- **環境**: 該当なし（ドキュメント・プロセス整備）
- **方法**: ドキュメント更新 + Git Hook追加
- **実行者**: システム管理者

### 変更内容

#### 追加したファイル
1. **MIGRATION_HISTORY.md** - マイグレーション履歴管理ファイル（本ファイル）
2. **.husky/pre-commit-migration-check.sh** - スキーマ変更時の履歴更新チェック

#### 更新したファイル
**CLAUDE.md:**
- 「実際の開発フロー」セクションに履歴更新ステップを追加
- 「⚠️ マイグレーション実行時の必須ルール」セクションを新設
- ClaudeCodeに対する明示的な指示を追加

### 変更理由
- マイグレーション履歴が体系的に管理されていなかった
- 将来的に「何をいつ変更したか」を追跡可能にする必要があった
- ClaudeCodeによる自動マイグレーション時の記録漏れを防止

### 実装した仕組み

#### 1. MIGRATION_HISTORY.md
- 各マイグレーションの詳細を記録
- 統一フォーマットのテンプレート提供
- 日付、環境、変更内容、理由、影響ファイルを記録

#### 2. CLAUDE.mdへの明記
ClaudeCodeが読み込むプロジェクト仕様書に以下を追加：
- マイグレーション実行時の必須手順としてMIGRATION_HISTORY.md更新を明記
- 記録すべき情報の詳細を列挙
- コミット時のルール（同じコミットに含める、メッセージ規約）

#### 3. Git Hook（オプション）
- スキーマファイル変更時にMIGRATION_HISTORY.md更新を確認
- 更新されていない場合はコミットを拒否
- `--no-verify` で強制コミット可能

### 影響を受けたファイル
- `MIGRATION_HISTORY.md` - 新規作成
- `CLAUDE.md` - マイグレーションフロー更新
- `.husky/pre-commit-migration-check.sh` - 新規作成

### 運用方法

#### ClaudeCodeによるマイグレーション
ClaudeCodeは`CLAUDE.md`を自動的に読み込むため、マイグレーション実行時に自動的に`MIGRATION_HISTORY.md`を更新するようになります。

#### 手動マイグレーション
開発者が直接マイグレーションを実行する場合：
```bash
# 1. スキーマ変更
vim src/db/schema.ts

# 2. マイグレーション実行
npm run db:push:dev

# 3. 履歴記録
vim MIGRATION_HISTORY.md
# テンプレートをコピーして記入

# 4. コミット
git add MIGRATION_HISTORY.md src/db/schema.ts
git commit -m "migration: フィールドXXXを追加"
```

Git Hookが有効な場合、記録漏れがあればコミット時に警告されます。

### 注意事項
- ✅ MIGRATION_HISTORY.mdは`.gitignore`対象外（必ずコミット）
- ✅ マイグレーションとドキュメント更新は同じコミットに含める
- ℹ️ Git Hookは任意（Husky未導入の場合は不要）
- ℹ️ データベーススキーマの変更のみを記録（コード変更のみは記録不要）

### 今後の展望
このマイグレーション管理体制により：
- 変更履歴の可視化
- チーム開発時の情報共有
- トラブルシューティングの効率化
- ロールバック時の判断材料提供

が実現されます。

---

## 0001: team_idカラムの削除（2026-02-05）

### 基本情報
- **日付**: 2026年2月5日
- **環境**: dev
- **方法**: 手動スクリプト（`scripts/remove-team-id-columns.mjs`）
- **Drizzleスナップショット**: `0001_thankful_selene`
- **実行者**: システム管理者

### 変更内容

#### 削除したカラム
**t_matches_final テーブル:**
- `team1_id` (TEXT, 外部キー: m_teams.team_id) → 削除
- `team2_id` (TEXT, 外部キー: m_teams.team_id) → 削除
- `winner_team_id` (TEXT, 外部キー: m_teams.team_id) → 削除

**t_matches_live テーブル:**
- `team1_id` (TEXT, 外部キー: m_teams.team_id) → 削除
- `team2_id` (TEXT, 外部キー: m_teams.team_id) → 削除
- `winner_team_id` (TEXT, 外部キー: m_teams.team_id) → 削除

#### 残存カラム（変更なし）
両テーブルとも以下は維持：
- `team1_tournament_team_id` (INTEGER)
- `team2_tournament_team_id` (INTEGER)
- `winner_tournament_team_id` (INTEGER)

### 変更理由
- 同一マスターチームから複数エントリーを可能にする設計変更（Phase 4）
- `team_id`（マスターチームID）から`tournament_team_id`（大会別エントリーID）への移行完了
- 既存コードは全て`tournament_team_id`ベースに書き換え済み
- 不要になった`team_id`カラムを物理削除してスキーマをクリーンアップ

### 実行方法
```bash
# スキーマ定義を更新
# src/db/schema.ts から team1_id, team2_id, winner_team_id フィールドを削除

# 手動マイグレーションスクリプトを実行
node scripts/remove-team-id-columns.mjs

# スキーマを取得して確認
npm run db:pull
```

### 影響を受けたファイル（合計30ファイル）

#### スキーマ定義（1ファイル）
- `src/db/schema.ts` - テーブル定義からフィールド削除

#### 型定義（2ファイル）
- `lib/types.ts` - `MatchResult`型から`team_id`系プロパティ削除
- `lib/tournament-bracket/types.ts` - ブラケット型定義更新

#### API Routes（4ファイル）
- `app/api/admin/withdrawal-requests/[id]/impact/route.ts`
- `app/api/matches/[id]/cancel/route.ts`
- `app/api/matches/[id]/confirm/route.ts`
- `app/api/tournaments/[id]/draw/route.ts`

#### ビジネスロジック（6ファイル）
- `lib/match-result-handler.ts`
- `lib/match-results-calculator.ts`
- `lib/standings-calculator.ts`
- `lib/template-position-handler.ts`
- `lib/tournament-progression.ts`
- `lib/withdrawal-processor.ts`

#### その他（17ファイル）
- ドキュメント、バックアップ、マイグレーションファイルなど

### 技術的詳細

#### SQLiteテーブル再作成パターンを使用
```sql
-- 1. 外部キー制約を無効化
PRAGMA foreign_keys=OFF;

-- 2. 新しいテーブルを作成（不要カラムを除外）
CREATE TABLE t_matches_final_new (...);

-- 3. データをコピー
INSERT INTO t_matches_final_new SELECT ... FROM t_matches_final;

-- 4. 古いテーブルを削除
DROP TABLE t_matches_final;

-- 5. 新しいテーブルをリネーム
ALTER TABLE t_matches_final_new RENAME TO t_matches_final;

-- 6. インデックスを再作成
CREATE INDEX idx_matches_final_team1_tournament ON ...;

-- 7. 外部キー制約を再有効化
PRAGMA foreign_keys=ON;
```

### 注意事項
- ⚠️ **データ復旧不可**: 削除された`team_id`カラムのデータは復旧できません
- ✅ **データ再構築可能**: `tournament_team_id`から`t_tournament_teams`テーブルを結合すれば`team_id`を取得可能
- ⚠️ **Turso制約**: Drizzle Kitの`db:migrate`は使用不可（`--> statement-breakpoint`構文エラー）
- ✅ **回避策**: 手動スクリプトまたは`db:push`を使用

### 関連Issue
- GitHub Issue #13: team_id → tournament_team_id 完全移行

---

## 0000: 初回スキーマ取得（2026-01-XX）

### 基本情報
- **日付**: Drizzle ORM導入時
- **環境**: dev
- **方法**: `npm run db:pull`
- **Drizzleスナップショット**: `0000_motionless_major_mapleleaf`

### 変更内容
既存データベースからスキーマ定義を初回取得。30テーブル全体を`src/db/schema.ts`と`src/db/relations.ts`にエクスポート。

### 注意事項
この`0000_*`ファイルは実際のマイグレーションではなく、初回スナップショットのため`.gitignore`で除外されています。

---

## 今後のマイグレーション記録テンプレート

```markdown
## XXXX: [変更内容の簡潔な説明]（YYYY-MM-DD）

### 基本情報
- **日付**:
- **環境**: dev/stag/main
- **方法**: db:push / db:migrate / 手動スクリプト
- **Drizzleスナップショット**:
- **実行者**:

### 変更内容
[具体的な変更内容を箇条書き]

### 変更理由
[なぜこの変更が必要だったか]

### 実行方法
```bash
# 実行したコマンド
```

### 影響を受けたファイル
- ファイル1
- ファイル2

### 注意事項
[特記事項、データ損失の可能性、ロールバック方法など]

### 関連Issue/PR
- Issue #XX
- PR #XX
```
