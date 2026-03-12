-- 0026: 旧チームログイン機能の完全削除
-- m_teams.password_hash を DROP
-- t_password_reset_tokens を team_id から login_user_id に移行
-- ※ SQLiteでは外部キー制約を持つカラムのDROP COLUMNが不可のため、テーブル再作成方式を使用

-- Step 1: t_password_reset_tokens に login_user_id カラムを追加（一時的）
ALTER TABLE t_password_reset_tokens ADD COLUMN login_user_id INTEGER;

-- Step 2: 既存トークンデータのマイグレーション（m_team_members経由で紐付け可能なもの）
UPDATE t_password_reset_tokens
SET login_user_id = (
  SELECT tm.login_user_id
  FROM m_team_members tm
  WHERE tm.team_id = t_password_reset_tokens.team_id
    AND tm.is_active = 1
  LIMIT 1
)
WHERE team_id IS NOT NULL AND login_user_id IS NULL;

-- Step 3: マイグレーションできなかったトークンを削除
DELETE FROM t_password_reset_tokens WHERE login_user_id IS NULL;

-- Step 4: 新テーブル作成（team_idなし、login_user_idあり）
CREATE TABLE t_password_reset_tokens_new (
  token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_user_id INTEGER NOT NULL REFERENCES m_login_users(login_user_id) ON DELETE CASCADE,
  reset_token TEXT NOT NULL,
  expires_at NUMERIC NOT NULL,
  used_at NUMERIC,
  created_at NUMERIC DEFAULT (datetime('now', '+9 hours'))
);

-- Step 5: データコピー
INSERT INTO t_password_reset_tokens_new (token_id, login_user_id, reset_token, expires_at, used_at, created_at)
SELECT token_id, login_user_id, reset_token, expires_at, used_at, created_at
FROM t_password_reset_tokens
WHERE login_user_id IS NOT NULL;

-- Step 6: 旧テーブル削除 & リネーム
DROP TABLE t_password_reset_tokens;
ALTER TABLE t_password_reset_tokens_new RENAME TO t_password_reset_tokens;

-- Step 7: インデックス作成
CREATE INDEX IF NOT EXISTS idx_login_user_reset_tokens ON t_password_reset_tokens(login_user_id);
CREATE INDEX IF NOT EXISTS idx_reset_token ON t_password_reset_tokens(reset_token);
CREATE INDEX IF NOT EXISTS idx_expires_at ON t_password_reset_tokens(expires_at);

-- Step 8: m_teams.password_hash を DROP
ALTER TABLE m_teams DROP COLUMN password_hash;
