-- Custom SQL migration file, put your code below! --

-- m_login_usersテーブルにcreated_by_login_user_idカラムを追加
ALTER TABLE m_login_users ADD COLUMN created_by_login_user_id INTEGER;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_login_users_created_by ON m_login_users(created_by_login_user_id);

-- 運営者招待テーブルを作成
CREATE TABLE IF NOT EXISTS t_operator_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  invited_by_login_user_id INTEGER NOT NULL,
  tournament_access TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_by_login_user_id INTEGER,
  accepted_at TEXT,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (invited_by_login_user_id) REFERENCES m_login_users(login_user_id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_by_login_user_id) REFERENCES m_login_users(login_user_id)
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_operator_invitations_email ON t_operator_invitations(email);
CREATE INDEX IF NOT EXISTS idx_operator_invitations_token ON t_operator_invitations(token);
CREATE INDEX IF NOT EXISTS idx_operator_invitations_status ON t_operator_invitations(status);
CREATE INDEX IF NOT EXISTS idx_operator_invitations_invited_by ON t_operator_invitations(invited_by_login_user_id);