CREATE TABLE `t_team_invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`invited_by_login_user_id` integer NOT NULL,
	`invited_email` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` numeric NOT NULL,
	`accepted_at` numeric,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	FOREIGN KEY (`team_id`) REFERENCES `m_teams`(`team_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_login_user_id`) REFERENCES `m_login_users`(`login_user_id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `t_team_invitations_token_unique` ON `t_team_invitations` (`token`);
CREATE INDEX `idx_team_invitations_team` ON `t_team_invitations` (`team_id`);
CREATE INDEX `idx_team_invitations_token` ON `t_team_invitations` (`token`);
CREATE INDEX `idx_team_invitations_email` ON `t_team_invitations` (`invited_email`);
CREATE INDEX `idx_team_invitations_status` ON `t_team_invitations` (`status`);
