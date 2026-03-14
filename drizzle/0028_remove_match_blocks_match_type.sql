-- 0028: t_match_blocks から match_type カラムを削除
-- match_type は試合単位で管理すべきため、t_matches_live.match_type に統一
-- t_match_blocks.match_type は全箇所で使用を停止済み

ALTER TABLE t_match_blocks DROP COLUMN match_type;
