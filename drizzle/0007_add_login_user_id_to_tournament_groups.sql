ALTER TABLE t_tournament_groups ADD COLUMN login_user_id INTEGER REFERENCES m_login_users(login_user_id);
