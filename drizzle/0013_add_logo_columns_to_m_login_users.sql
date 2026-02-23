-- drizzle/0013_add_logo_columns_to_m_login_users.sql
-- m_login_usersテーブルにロゴ関連カラムを追加

ALTER TABLE m_login_users ADD COLUMN logo_blob_url TEXT;
ALTER TABLE m_login_users ADD COLUMN logo_filename TEXT;
ALTER TABLE m_login_users ADD COLUMN organization_name TEXT;
