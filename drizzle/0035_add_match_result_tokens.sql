CREATE TABLE IF NOT EXISTS `t_match_result_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL REFERENCES `t_matches_live`(`match_id`) ON DELETE CASCADE,
	`token` text NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours')),
	UNIQUE(`token`)
);

CREATE INDEX IF NOT EXISTS `idx_match_result_tokens_token` ON `t_match_result_tokens` (`token`);
CREATE INDEX IF NOT EXISTS `idx_match_result_tokens_match_id` ON `t_match_result_tokens` (`match_id`);
