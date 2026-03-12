-- 大会運営者管理システム（部門単位アクセス制御）
-- 注: m_operatorsテーブルは廃止。m_login_usersに統合されました。

-- ==========================================
-- t_operator_tournament_access（運営者部門アクセス権限）
-- ==========================================
CREATE TABLE `t_operator_tournament_access` (
	`access_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operator_id` integer NOT NULL,
	`tournament_id` integer NOT NULL,
	`permissions` text NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	`updated_at` numeric DEFAULT (datetime('now', '+9 hours')),
	FOREIGN KEY (`operator_id`) REFERENCES `m_login_users`(`login_user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tournament_id`) REFERENCES `t_tournaments`(`tournament_id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_operator_access_operator` ON `t_operator_tournament_access` (`operator_id`);
CREATE INDEX `idx_operator_access_tournament` ON `t_operator_tournament_access` (`tournament_id`);
