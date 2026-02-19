-- 都道府県マスタテーブルの作成
CREATE TABLE IF NOT EXISTS `m_prefectures` (
	`prefecture_id` integer PRIMARY KEY NOT NULL,
	`prefecture_name` text NOT NULL,
	`prefecture_code` text NOT NULL,
	`region_name` text NOT NULL,
	`display_order` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` numeric DEFAULT (datetime('now', '+9 hours'))
);

-- 会場テーブルにprefecture_idカラムを追加
ALTER TABLE `m_venues` ADD COLUMN `prefecture_id` integer REFERENCES m_prefectures(prefecture_id);
