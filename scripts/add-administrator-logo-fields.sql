-- scripts/add-administrator-logo-fields.sql
-- 管理者ロゴ機能のためのフィールド追加

-- m_administratorsテーブルにロゴ関連フィールドを追加
ALTER TABLE m_administrators ADD COLUMN logo_blob_url TEXT;
ALTER TABLE m_administrators ADD COLUMN logo_filename TEXT;
ALTER TABLE m_administrators ADD COLUMN organization_name TEXT;

-- インデックス追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_administrators_logo_url ON m_administrators(logo_blob_url);
CREATE INDEX IF NOT EXISTS idx_administrators_organization ON m_administrators(organization_name);