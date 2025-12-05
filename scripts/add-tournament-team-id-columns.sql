-- tournament_team_id カラムをt_matches_live, t_matches_finalテーブルに追加
-- 同一team_idの複数チーム参加時の正確な識別のため

-- ===============================================
-- t_matches_live テーブルの拡張
-- ===============================================
ALTER TABLE t_matches_live ADD COLUMN team1_tournament_team_id INTEGER;
ALTER TABLE t_matches_live ADD COLUMN team2_tournament_team_id INTEGER;
ALTER TABLE t_matches_live ADD COLUMN winner_tournament_team_id INTEGER;

-- ===============================================
-- t_matches_final テーブルの拡張
-- ===============================================
ALTER TABLE t_matches_final ADD COLUMN team1_tournament_team_id INTEGER;
ALTER TABLE t_matches_final ADD COLUMN team2_tournament_team_id INTEGER;
ALTER TABLE t_matches_final ADD COLUMN winner_tournament_team_id INTEGER;

-- ===============================================
-- インデックス作成（パフォーマンス向上）
-- ===============================================
CREATE INDEX IF NOT EXISTS idx_matches_live_team1_tournament ON t_matches_live(team1_tournament_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_live_team2_tournament ON t_matches_live(team2_tournament_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_live_winner_tournament ON t_matches_live(winner_tournament_team_id);

CREATE INDEX IF NOT EXISTS idx_matches_final_team1_tournament ON t_matches_final(team1_tournament_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_final_team2_tournament ON t_matches_final(team2_tournament_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_final_winner_tournament ON t_matches_final(winner_tournament_team_id);
