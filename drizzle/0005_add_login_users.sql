-- 統合ログインユーザー管理テーブル追加
-- m_login_users, m_login_user_roles, m_login_user_authority, m_team_members

CREATE TABLE `m_login_users` (
	`login_user_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`is_superadmin` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	`updated_at` numeric DEFAULT (datetime('now', '+9 hours'))
);

CREATE UNIQUE INDEX `m_login_users_email_unique` ON `m_login_users` (`email`);
CREATE INDEX `idx_login_users_email` ON `m_login_users` (`email`);
CREATE INDEX `idx_login_users_active` ON `m_login_users` (`is_active`);

CREATE TABLE `m_login_user_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`login_user_id` integer NOT NULL,
	`role` text NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	FOREIGN KEY (`login_user_id`) REFERENCES `m_login_users`(`login_user_id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_login_user_roles_user` ON `m_login_user_roles` (`login_user_id`);
CREATE INDEX `idx_login_user_roles_role` ON `m_login_user_roles` (`role`);

CREATE TABLE `m_login_user_authority` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`login_user_id` integer NOT NULL,
	`tournament_id` integer NOT NULL,
	`permissions` text NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	`updated_at` numeric DEFAULT (datetime('now', '+9 hours')),
	FOREIGN KEY (`login_user_id`) REFERENCES `m_login_users`(`login_user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tournament_id`) REFERENCES `t_tournaments`(`tournament_id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_login_user_authority_user` ON `m_login_user_authority` (`login_user_id`);
CREATE INDEX `idx_login_user_authority_tournament` ON `m_login_user_authority` (`tournament_id`);

CREATE TABLE `m_team_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`login_user_id` integer NOT NULL,
	`member_role` text DEFAULT 'primary' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	`updated_at` numeric DEFAULT (datetime('now', '+9 hours')),
	FOREIGN KEY (`team_id`) REFERENCES `m_teams`(`team_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`login_user_id`) REFERENCES `m_login_users`(`login_user_id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_team_members_team` ON `m_team_members` (`team_id`);
CREATE INDEX `idx_team_members_user` ON `m_team_members` (`login_user_id`);
CREATE INDEX `idx_team_members_active` ON `m_team_members` (`team_id`, `is_active`);
