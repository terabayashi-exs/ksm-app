ALTER TABLE t_tournaments ADD COLUMN format_name TEXT;
UPDATE t_tournaments SET format_name = (SELECT format_name FROM m_tournament_formats WHERE m_tournament_formats.format_id = t_tournaments.format_id);
