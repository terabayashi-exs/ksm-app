-- 順位決定ルール機能追加のためのテーブル拡張
-- Phase 1: データベース拡張

-- t_tournament_rulesテーブルに順位決定ルール関連のカラムを追加
ALTER TABLE t_tournament_rules ADD COLUMN tie_breaking_rules TEXT;
-- JSON形式で順位決定ルールを保存
-- 例: [{"type":"points","order":1},{"type":"goal_difference","order":2},{"type":"head_to_head","order":3}]

ALTER TABLE t_tournament_rules ADD COLUMN tie_breaking_enabled INTEGER DEFAULT 1;
-- 順位決定ルールの有効/無効フラグ (0=無効, 1=有効)

-- インデックス追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_tournament_rules_tournament_phase 
ON t_tournament_rules(tournament_id, phase);

-- スキーマ更新完了ログ
INSERT INTO sample_data (value) VALUES ('tie_breaking_rules_schema_updated_' || datetime('now', '+9 hours'));