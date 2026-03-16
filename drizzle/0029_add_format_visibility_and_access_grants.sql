-- 0029: フォーマット公開制御（visibility + t_format_access_grants）
-- 特殊フォーマット（27チーム、29チーム等）を特定の管理者にだけ公開するためのアクセス制御
-- visibility: "public" = 全ユーザー使用可能（デフォルト）, "restricted" = アクセス権を持つユーザーのみ

-- m_tournament_formats に visibility カラム追加
ALTER TABLE m_tournament_formats ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

-- フォーマットアクセス付与テーブル新設
CREATE TABLE t_format_access_grants (
  grant_id INTEGER PRIMARY KEY AUTOINCREMENT,
  format_id INTEGER NOT NULL REFERENCES m_tournament_formats(format_id) ON DELETE CASCADE,
  login_user_id INTEGER NOT NULL,
  granted_by_login_user_id INTEGER,
  granted_at NUMERIC DEFAULT (datetime('now', '+9 hours')),
  expires_at NUMERIC,
  notes TEXT
);

-- インデックス
CREATE INDEX idx_format_grants_format ON t_format_access_grants(format_id);
CREATE INDEX idx_format_grants_user ON t_format_access_grants(login_user_id);
CREATE UNIQUE INDEX idx_format_grants_unique ON t_format_access_grants(format_id, login_user_id);
