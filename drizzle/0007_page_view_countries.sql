CREATE TABLE `page_view_countries` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`country_code` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`day` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`views` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `page_view_countries_id` PRIMARY KEY(`id`),
	CONSTRAINT `page_view_countries_uq` UNIQUE(`country_code`,`day`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `page_view_countries_day_idx` ON `page_view_countries` (`day`);
