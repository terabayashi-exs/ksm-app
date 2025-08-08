-- チーム登録種別フィールドを追加するマイグレーション
-- 実行日: 2025-01-XX
-- 目的: チーム代表者登録と管理者代行登録を区別するため

-- m_teamsテーブルにregistration_typeフィールドを追加
ALTER TABLE m_teams ADD COLUMN registration_type TEXT DEFAULT 'self_registered';

-- 既存データを 'self_registered'（代表者登録）に設定
UPDATE m_teams SET registration_type = 'self_registered' WHERE registration_type IS NULL;

-- 制約条件追加（値を限定）
-- SQLiteでは直接CHECK制約を後から追加できないため、コメントで記載
-- 有効な値: 'self_registered'（代表者登録）, 'admin_proxy'（管理者代行）

-- 確認クエリ
SELECT team_id, team_name, registration_type, created_at FROM m_teams ORDER BY created_at DESC LIMIT 10;