-- スクリプト名: remove-tournament-teams-unique-constraint.sql
-- 目的: t_tournament_teamsテーブルのUNIQUE(tournament_id, team_id)制約を削除
-- 理由: 複数チーム参加機能を有効にするため（同一マスターチームから複数エントリー）
-- 実行日: 2026-01-08

-- ステップ1: 既存データを一時テーブルにバックアップ
CREATE TABLE t_tournament_teams_backup AS
SELECT * FROM t_tournament_teams;

-- ステップ2: 既存テーブルを削除
DROP TABLE t_tournament_teams;

-- ステップ3: UNIQUE制約なしで新しいテーブルを作成
CREATE TABLE t_tournament_teams (
    tournament_team_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    assigned_block TEXT,
    block_position INTEGER,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    team_name TEXT NOT NULL DEFAULT '',
    team_omission TEXT NOT NULL DEFAULT '',
    withdrawal_status TEXT DEFAULT 'active',
    withdrawal_reason TEXT,
    withdrawal_requested_at DATETIME,
    withdrawal_processed_at DATETIME,
    withdrawal_processed_by TEXT,
    withdrawal_admin_comment TEXT,
    registration_method TEXT DEFAULT 'self_registered',
    participation_status TEXT NOT NULL DEFAULT 'confirmed',
    waitlist_position INTEGER NULL,
    FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
    FOREIGN KEY (team_id) REFERENCES m_teams(team_id)
    -- UNIQUE(tournament_id, team_id) 制約を削除
);

-- ステップ4: データを復元
INSERT INTO t_tournament_teams
SELECT * FROM t_tournament_teams_backup;

-- ステップ5: バックアップテーブルを削除
DROP TABLE t_tournament_teams_backup;

-- 確認: 複数チーム参加が可能になったことを確認
-- SELECT tournament_id, team_id, COUNT(*) as count
-- FROM t_tournament_teams
-- GROUP BY tournament_id, team_id
-- HAVING count > 1;
