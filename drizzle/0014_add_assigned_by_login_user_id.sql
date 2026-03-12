-- 部門アクセス権付与者追跡フィールド追加
-- t_operator_tournament_accessテーブルにassigned_by_login_user_idカラムを追加

ALTER TABLE `t_operator_tournament_access`
ADD COLUMN `assigned_by_login_user_id` integer REFERENCES `m_login_users`(`login_user_id`) ON DELETE SET NULL;

-- インデックス追加
CREATE INDEX `idx_operator_access_assigned_by` ON `t_operator_tournament_access` (`assigned_by_login_user_id`);
