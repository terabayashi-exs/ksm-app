-- 大会エントリー時のチーム名・略称フィールド追加マイグレーション
-- 実行日: 2024年
-- 概要: t_tournament_teamsテーブルにteam_nameとteam_omissionフィールドを追加し、
--       同一マスターチームから複数の大会エントリーを可能にする

-- Step 1: フィールド追加
ALTER TABLE t_tournament_teams 
ADD COLUMN team_name TEXT NOT NULL DEFAULT '';

ALTER TABLE t_tournament_teams 
ADD COLUMN team_omission TEXT NOT NULL DEFAULT '';

-- Step 2: 既存データに対してマスターチームの情報をコピー（一時的措置）
-- 既存のエントリーについては、マスターチームの名前・略称をそのまま使用
UPDATE t_tournament_teams 
SET 
    team_name = (
        SELECT team_name 
        FROM m_teams 
        WHERE m_teams.team_id = t_tournament_teams.team_id
    ),
    team_omission = COALESCE(
        (SELECT team_omission 
         FROM m_teams 
         WHERE m_teams.team_id = t_tournament_teams.team_id), 
        (SELECT SUBSTR(team_name, 1, 6) 
         FROM m_teams 
         WHERE m_teams.team_id = t_tournament_teams.team_id)
    )
WHERE team_name = '' OR team_omission = '';

-- Step 3: 制約の変更（空文字を許可しないように）
-- SQLiteでは制約の変更が制限されるため、まず確認用クエリ

-- 確認用: 更新されたデータを表示
SELECT 
    tournament_team_id,
    tournament_id,
    team_id,
    team_name,
    team_omission,
    assigned_block,
    block_position
FROM t_tournament_teams;

-- Step 4: インデックス追加（パフォーマンス向上）
-- 大会内でのチーム名の一意性を保証するための複合インデックス
CREATE UNIQUE INDEX idx_tournament_teams_unique_name 
ON t_tournament_teams(tournament_id, team_name);

CREATE UNIQUE INDEX idx_tournament_teams_unique_omission 
ON t_tournament_teams(tournament_id, team_omission);

-- 注意: 既存のデータがある場合、同じ大会内で重複するチーム名・略称があれば
-- 上記のUNIQUEインデックス作成は失敗します。
-- その場合は、まずデータの重複を解消してからインデックスを作成してください。