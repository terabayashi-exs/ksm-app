CREATE TABLE IF NOT EXISTS `t_tournament_notices` (
	`tournament_notice_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL REFERENCES `t_tournaments`(`tournament_id`) ON DELETE CASCADE,
	`content` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	`updated_at` numeric DEFAULT (datetime('now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS `idx_tournament_notices_tournament` ON `t_tournament_notices` (`tournament_id`);
