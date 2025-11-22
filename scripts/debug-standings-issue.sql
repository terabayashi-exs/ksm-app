-- 本番環境でID:74の大会の試合データと順位計算を検証するSQL
-- Tursoのコンソールで実行してください

-- 1. 大会情報の確認
SELECT '=== 大会情報 ===' as info;
SELECT tournament_id, tournament_name
FROM t_tournaments
WHERE tournament_id = 74;

-- 2. ブロック情報の確認
SELECT '=== ブロック情報 ===' as info;
SELECT match_block_id, phase, block_name, display_round_name
FROM t_match_blocks
WHERE tournament_id = 74
ORDER BY match_block_id;

-- 3. 各ブロックの参加チーム一覧（例: Aブロック）
SELECT '=== 参加チーム (例: Aブロック) ===' as info;
SELECT tt.team_id, t.team_name, tt.assigned_block
FROM t_tournament_teams tt
JOIN m_teams t ON tt.team_id = t.team_id
WHERE tt.tournament_id = 74 AND tt.assigned_block = 'A'
ORDER BY t.team_name;

-- 4. 確定済み試合の確認（例: ブロックID=XXX）
-- ※ブロックIDは2番目のクエリの結果から適切なものを選択してください
SELECT '=== 確定済み試合（ブロックIDを適切に変更してください）===' as info;
SELECT
  mf.match_id,
  ml.match_code,
  mf.team1_id,
  mf.team2_id,
  t1.team_name as team1_name,
  t2.team_name as team2_name,
  mf.team1_scores,
  mf.team2_scores,
  mf.winner_team_id,
  mf.is_draw,
  tw.team_name as winner_name
FROM t_matches_final mf
JOIN t_matches_live ml ON mf.match_id = ml.match_id
LEFT JOIN m_teams t1 ON mf.team1_id = t1.team_id
LEFT JOIN m_teams t2 ON mf.team2_id = t2.team_id
LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
WHERE mf.match_block_id = 197  -- ←ここを実際のブロックIDに変更
  AND (ml.match_status IS NULL OR ml.match_status != 'cancelled')
ORDER BY ml.match_code;

-- 5. 特定チームの試合一覧（問題が発生しているチームのIDを指定）
SELECT '=== 特定チームの試合一覧（チームIDを変更してください）===' as info;
SELECT
  ml.match_code,
  CASE WHEN mf.team1_id = 'team_xxx' THEN t2.team_name ELSE t1.team_name END as opponent,
  mf.team1_scores,
  mf.team2_scores,
  mf.winner_team_id,
  mf.is_draw,
  CASE
    WHEN mf.is_draw THEN '引き分け'
    WHEN mf.winner_team_id = 'team_xxx' THEN '勝利'
    ELSE '敗北'
  END as result
FROM t_matches_final mf
JOIN t_matches_live ml ON mf.match_id = ml.match_id
LEFT JOIN m_teams t1 ON mf.team1_id = t1.team_id
LEFT JOIN m_teams t2 ON mf.team2_id = t2.team_id
WHERE (mf.team1_id = 'team_xxx' OR mf.team2_id = 'team_xxx')  -- ←ここを実際のチームIDに変更
  AND (ml.match_status IS NULL OR ml.match_status != 'cancelled')
ORDER BY ml.match_code;

-- 6. team_rankingsに保存されている順位データ
SELECT '=== 保存されている順位表（ブロックIDを変更してください）===' as info;
SELECT match_block_id, team_rankings
FROM t_match_blocks
WHERE match_block_id = 197;  -- ←ここを実際のブロックIDに変更

-- 7. データ型の確認（team_idの型不一致がないか確認）
SELECT '=== team_idの型確認 ===' as info;
SELECT DISTINCT
  typeof(tt.team_id) as tournament_teams_type,
  typeof(mf.team1_id) as matches_final_type
FROM t_tournament_teams tt
LEFT JOIN t_matches_final mf ON tt.tournament_id = 74
WHERE tt.tournament_id = 74
LIMIT 5;
