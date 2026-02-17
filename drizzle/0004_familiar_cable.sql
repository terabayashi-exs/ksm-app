-- 大会運営者管理システム（部門単位アクセス制御）

-- ==========================================
-- m_operators（運営者マスター）
-- ==========================================
CREATE TABLE `m_operators` (
	`operator_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operator_login_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`operator_name` text NOT NULL,
	`administrator_id` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	`updated_at` numeric DEFAULT (datetime('now', '+9 hours')),
	FOREIGN KEY (`administrator_id`) REFERENCES `m_administrators`(`administrator_id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `m_operators_operator_login_id_unique` ON `m_operators` (`operator_login_id`);
CREATE INDEX `idx_operators_admin` ON `m_operators` (`administrator_id`);
CREATE INDEX `idx_operators_login` ON `m_operators` (`operator_login_id`);

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
	FOREIGN KEY (`operator_id`) REFERENCES `m_operators`(`operator_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tournament_id`) REFERENCES `t_tournaments`(`tournament_id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_operator_access_operator` ON `t_operator_tournament_access` (`operator_id`);
CREATE INDEX `idx_operator_access_tournament` ON `t_operator_tournament_access` (`tournament_id`);
