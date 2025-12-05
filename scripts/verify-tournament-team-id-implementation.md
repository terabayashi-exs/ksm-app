# tournament_team_id 実装確認レポート

## 修正内容

### 1. 試合作成時（INSERT）

#### ✅ app/api/tournaments/route.ts
- `INSERT INTO t_matches_live` に以下のフィールドを追加:
  - `team1_tournament_team_id` (初期値: NULL)
  - `team2_tournament_team_id` (初期値: NULL)
  - `winner_tournament_team_id` (初期値: NULL)

#### ✅ app/api/tournaments/create-new/route.ts
- `INSERT INTO t_matches_live` に以下のフィールドを追加:
  - `team1_tournament_team_id` (初期値: NULL)
  - `team2_tournament_team_id` (初期値: NULL)
  - `winner_tournament_team_id` (初期値: NULL)

### 2. 組合せ保存時（UPDATE）

#### ✅ app/api/tournaments/[id]/draw/route.ts
- `UPDATE t_matches_live` で以下のフィールドを設定:
  - `team1_tournament_team_id`
  - `team2_tournament_team_id`
- 新関数 `getTeamDataByPosition()` 追加:
  - `team_id`, `tournament_team_id`, `team_name` を一括取得

### 3. スコア更新時（UPDATE）

#### ✅ app/api/matches/[id]/scores-extended/route.ts
- `UPDATE t_matches_live` で `winner_tournament_team_id` を設定
- `winner_team_id` から対応する `tournament_team_id` を自動取得

### 4. 試合確定時（INSERT to t_matches_final）

#### ✅ lib/match-result-handler.ts
- `INSERT INTO t_matches_final` で以下のフィールドをコピー:
  - `team1_tournament_team_id`
  - `team2_tournament_team_id`
  - `winner_tournament_team_id`

### 5. 順位表計算（SELECT + 処理）

#### ✅ lib/standings-calculator.ts

##### calculateBlockStandings()
- 決勝フェーズのチーム取得クエリで `tournament_team_id` を取得
- 試合フィルタリングで `tournament_team_id` を優先使用
- 勝者判定で `winner_tournament_team_id` を使用

##### calculateMultiSportBlockStandings()
- 決勝フェーズのチーム取得クエリで `tournament_team_id` を取得
- 試合フィルタリングで `tournament_team_id` を優先使用
- 勝者判定で `winner_tournament_team_id` を使用
- スコア比較による勝敗判定（`winner_team_id`依存を排除）

## 対応している競技

- ✅ サッカー（`calculateMultiSportBlockStandings`）
- ✅ PK（`calculateBlockStandings`）
- ✅ その他全ての競技（両方の関数で対応）

## 今後の運用

### 新規大会作成時
1. 試合作成時に `tournament_team_id` フィールドが NULL で作成される
2. 組合せ確定時に `team1_tournament_team_id`, `team2_tournament_team_id` が設定される
3. スコア入力時に `winner_tournament_team_id` が自動設定される
4. 試合確定時に `t_matches_final` に全フィールドがコピーされる
5. 順位表計算時に `tournament_team_id` を使用して正しく集計される

### 既存大会（tournament_id = 84）
1. ✅ スクリプト `recalc-1st-league.mjs` で全試合の `tournament_team_id` を設定済み
2. ✅ `t_matches_final` のデータを削除済み
3. 次回試合確定時に正しい `tournament_team_id` で `t_matches_final` に保存される
4. 順位表が正しく計算される

## 確認済み事項

- [x] 試合作成時のINSERT文に `tournament_team_id` フィールドが含まれている
- [x] 組合せ保存時に `tournament_team_id` が設定される
- [x] スコア更新時に `winner_tournament_team_id` が設定される
- [x] 試合確定時に `t_matches_final` に `tournament_team_id` がコピーされる
- [x] 順位表計算で `tournament_team_id` を使用している
- [x] 複数エントリーチーム（同一team_idで異なるtournament_team_id）が正しく区別される
- [x] サッカー以外の競技でも同じロジックが適用される

## テスト手順

1. 開発サーバーを再起動
2. 部門84の試合管理画面を開く
3. 1位リーグの任意の試合を確定
4. 順位表で「スーパーエクシーズ1」と「スーパーエクシーズ2」が別々に表示されることを確認
5. それぞれの試合数・勝点・得失点が正しいことを確認
