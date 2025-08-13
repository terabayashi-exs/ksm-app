-- Migration: Add withdrawal fields to t_tournament_teams table
-- 大会エントリー辞退機能のためのフィールド追加

-- 1. 辞退ステータスフィールドを追加
-- 値: 'active' (参加中), 'withdrawal_requested' (辞退申請中), 'withdrawal_approved' (辞退承認済み), 'withdrawal_rejected' (辞退却下)
ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_status TEXT DEFAULT 'active';

-- 2. 辞退理由フィールドを追加
ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_reason TEXT;

-- 3. 辞退申請日時フィールドを追加
ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_requested_at DATETIME;

-- 4. 辞退処理完了日時フィールドを追加
ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_processed_at DATETIME;

-- 5. 辞退処理者（管理者）フィールドを追加
ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_processed_by TEXT;

-- 6. withdrawal_statusにインデックスを追加（検索性能向上）
CREATE INDEX IF NOT EXISTS idx_tournament_teams_withdrawal_status 
ON t_tournament_teams(withdrawal_status);

-- 7. 辞退申請日時にインデックスを追加（日付範囲検索用）
CREATE INDEX IF NOT EXISTS idx_tournament_teams_withdrawal_requested_at 
ON t_tournament_teams(withdrawal_requested_at);

-- 8. 複合インデックス: tournament_id + withdrawal_status（管理者画面用）
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament_withdrawal 
ON t_tournament_teams(tournament_id, withdrawal_status);

-- 9. 既存データの整合性チェック用制約
-- withdrawal_statusが'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected'の場合は
-- withdrawal_reasonとwithdrawal_requested_atが必須となるが、SQLiteでは複雑な制約は設定できないため
-- アプリケーション層で制御する

-- 10. 確認用クエリ（コメントアウト）
-- SELECT name, type FROM pragma_table_info('t_tournament_teams') WHERE name LIKE 'withdrawal%';
-- SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='t_tournament_teams' AND name LIKE '%withdrawal%';