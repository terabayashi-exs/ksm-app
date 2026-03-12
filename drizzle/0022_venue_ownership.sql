ALTER TABLE m_venues ADD COLUMN created_by_login_user_id integer;
ALTER TABLE m_venues ADD COLUMN is_shared integer NOT NULL DEFAULT 0;
UPDATE m_venues SET is_shared = 1;
