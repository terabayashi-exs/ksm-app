CREATE TABLE IF NOT EXISTS `t_disciplinary_settings` (
	`setting_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL REFERENCES `t_tournament_groups`(`group_id`) ON DELETE CASCADE,
	`yellow_threshold` integer DEFAULT 2 NOT NULL,
	`is_enabled` integer DEFAULT 1 NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	`updated_at` numeric DEFAULT (datetime('now', '+9 hours')),
	UNIQUE(`group_id`)
);

CREATE TABLE IF NOT EXISTS `t_disciplinary_actions` (
	`action_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL REFERENCES `t_tournament_groups`(`group_id`) ON DELETE CASCADE,
	`tournament_id` integer NOT NULL REFERENCES `t_tournaments`(`tournament_id`),
	`match_id` integer NOT NULL,
	`tournament_team_id` integer NOT NULL REFERENCES `t_tournament_teams`(`tournament_team_id`),
	`player_name` text NOT NULL,
	`card_type` text NOT NULL,
	`reason_code` integer NOT NULL,
	`reason_text` text,
	`suspension_matches` integer DEFAULT 0 NOT NULL,
	`is_void` integer DEFAULT 0 NOT NULL,
	`recorded_by` text,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	`updated_at` numeric DEFAULT (datetime('now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS `idx_disciplinary_group` ON `t_disciplinary_actions` (`group_id`);
CREATE INDEX IF NOT EXISTS `idx_disciplinary_tournament` ON `t_disciplinary_actions` (`tournament_id`);
CREATE INDEX IF NOT EXISTS `idx_disciplinary_team` ON `t_disciplinary_actions` (`tournament_team_id`);
CREATE INDEX IF NOT EXISTS `idx_disciplinary_match` ON `t_disciplinary_actions` (`match_id`);
CREATE INDEX IF NOT EXISTS `idx_disciplinary_player` ON `t_disciplinary_actions` (`tournament_team_id`, `player_name`);
