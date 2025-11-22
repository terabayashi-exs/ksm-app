# 順位表計算問題の診断ガイド

## 問題の症状
- 本番環境のID:74の部門で、2勝1引き分けのチームの勝点が3点になっている（正しくは7点）
- 得点・失点も正しく計算されていない
- 一番最初の試合のみが計算対象になっているようだ

## 考えられる原因

### 1. データベースに試合が1件しか保存されていない
**確認方法**:
```sql
SELECT COUNT(*) as confirmed_matches_count
FROM t_matches_final
WHERE match_block_id = <ブロックID>;
```

**期待値**: 該当ブロックの全試合数（例: 4チームなら6試合）
**もし1件だけなら**: 試合確定処理に問題があります

### 2. team_idの型不一致
**確認方法**:
```sql
-- team_idがどのように保存されているか確認
SELECT team1_id, typeof(team1_id), team2_id, typeof(team2_id)
FROM t_matches_final
WHERE match_block_id = <ブロックID>
LIMIT 5;

-- tournament_teamsとの比較
SELECT team_id, typeof(team_id)
FROM t_tournament_teams
WHERE tournament_id = 74
LIMIT 5;
```

**問題の可能性**:
- `t_matches_final`では文字列 ('team_123')
- `t_tournament_teams`では数値 (123)
- このような型の不一致があると`teamId === match.team1_id`が false になる

### 3. データ重複
**確認方法**:
```sql
SELECT match_id, COUNT(*) as duplicate_count
FROM t_matches_final
WHERE match_block_id = <ブロックID>
GROUP BY match_id
HAVING COUNT(*) > 1;
```

**期待値**: 結果なし（重複なし）
**もし重複があれば**: 同じ試合が複数回保存されている

### 4. 中止試合のフィルタリング問題
**確認方法**:
```sql
SELECT ml.match_code, ml.match_status, mf.match_id
FROM t_matches_live ml
LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
WHERE ml.match_block_id = <ブロックID>
ORDER BY ml.match_code;
```

**確認ポイント**: `match_status = 'cancelled'`の試合が除外されているか

## 診断手順

### ステップ1: 本番環境のTursoコンソールにアクセス
1. Tursoダッシュボードにログイン
2. 本番データベース(`ksm-main`)を選択
3. SQLコンソールを開く

### ステップ2: ブロックIDの特定
```sql
SELECT match_block_id, phase, block_name, display_round_name
FROM t_match_blocks
WHERE tournament_id = 74;
```

問題が発生しているブロックのIDをメモしてください。

### ステップ3: 問題チームのIDを特定
```sql
SELECT tt.team_id, t.team_name
FROM t_tournament_teams tt
JOIN m_teams t ON tt.team_id = t.team_id
WHERE tt.tournament_id = 74 AND tt.assigned_block = '<ブロック名>';
```

2勝1引き分けのチームのIDをメモしてください。

### ステップ4: そのチームの試合データを確認
```sql
SELECT
  ml.match_code,
  mf.team1_id,
  mf.team2_id,
  mf.team1_scores,
  mf.team2_scores,
  mf.winner_team_id,
  mf.is_draw,
  t1.team_name as team1_name,
  t2.team_name as team2_name
FROM t_matches_final mf
JOIN t_matches_live ml ON mf.match_id = ml.match_id
LEFT JOIN m_teams t1 ON mf.team1_id = t1.team_id
LEFT JOIN m_teams t2 ON mf.team2_id = t2.team_id
WHERE (mf.team1_id = '<チームID>' OR mf.team2_id = '<チームID>')
  AND mf.match_block_id = <ブロックID>
ORDER BY ml.match_code;
```

**期待値**: 3試合分のデータが表示される
**実際に何件表示されるか?**

### ステップ5: 手動計算
上記のクエリ結果から、勝点を手動計算してください:
- 勝利 × 3点
- 引き分け × 1点
- 敗北 × 0点

**結果が7点になりますか？**

### ステップ6: 保存されている順位表を確認
```sql
SELECT team_rankings
FROM t_match_blocks
WHERE match_block_id = <ブロックID>;
```

JSONをパースして、問題のチームの勝点を確認してください。

## よくある問題と解決策

### ケース1: 試合データが1件しか取得されていない
**原因**: 試合確定処理が正しく動作していない
**解決策**: 管理者画面から全試合を再確定する

### ケース2: team_idの型が不一致
**原因**: データベース移行時やCSV一括登録時の型変換ミス
**解決策**:
```sql
UPDATE t_matches_final
SET team1_id = CAST(team1_id AS TEXT),
    team2_id = CAST(team2_id AS TEXT);
```

### ケース3: 順位表が更新されていない
**原因**: 試合確定時の順位表更新処理が失敗している
**解決策**: API経由で順位表を再計算
```bash
curl -X POST https://your-app.vercel.app/api/tournaments/74/recalculate-standings \
  -H "Authorization: Bearer <管理者トークン>"
```

## 開発環境での再現テスト

開発環境（ID:82）で同様の問題が発生しないことを確認済みとのことなので、本番環境固有の問題である可能性が高いです。

確認ポイント:
1. 本番環境と開発環境でデータベーススキーマが一致しているか
2. 本番環境で最新のコードがデプロイされているか
3. 環境変数の設定が正しいか

## 報告フォーマット

診断結果を以下の形式で報告してください:

```
【診断結果】
ブロックID: XXX
問題のチームID: team_YYY
チーム名: ZZZZ

確定済み試合数: X件（期待: Y件）
取得されたデータ:
- 試合1: [match_code] [team1_scores] - [team2_scores] ([result])
- 試合2: ...
- 試合3: ...

手動計算の勝点: Z点
保存されている勝点: W点

team_idの型:
- t_matches_final: [型]
- t_tournament_teams: [型]

推定原因: [原因]
```
