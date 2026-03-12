-- Drop legacy preliminary_format_type and final_format_type columns
-- These have been replaced by the phases JSON field

ALTER TABLE m_tournament_formats DROP COLUMN preliminary_format_type;
ALTER TABLE m_tournament_formats DROP COLUMN final_format_type;
ALTER TABLE t_tournaments DROP COLUMN preliminary_format_type;
ALTER TABLE t_tournaments DROP COLUMN final_format_type;
