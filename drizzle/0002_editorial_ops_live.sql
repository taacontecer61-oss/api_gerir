-- Liveblog, notificações e analítica. Collation alinhada com tabelas existentes (utf8mb4_unicode_ci).

CREATE TABLE `live_coverages` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`slug` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`summary` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`description_html` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`category_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`author_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`cover_media_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`cover_alt` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`status` enum('preparation','scheduled','live','paused','ended','archived') NOT NULL DEFAULT 'preparation',
	`featured` boolean NOT NULL DEFAULT false,
	`seo_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`seo_description` varchar(320) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`noindex` boolean NOT NULL DEFAULT false,
	`stream_embed_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`stream_provider` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`stream_status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`scheduled_start_at` datetime(3),
	`started_at` datetime(3),
	`ended_at` datetime(3),
	`last_update_at` datetime(3),
	`version` int NOT NULL DEFAULT 1,
	`created_by_user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`updated_by_user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`deleted_at` datetime(3),
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `live_coverages_id` PRIMARY KEY(`id`),
	CONSTRAINT `live_coverages_slug_uq` UNIQUE(`slug`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `live_coverages_status_idx` ON `live_coverages` (`status`,`last_update_at`);
--> statement-breakpoint
CREATE INDEX `live_coverages_category_idx` ON `live_coverages` (`category_id`);
--> statement-breakpoint
ALTER TABLE `live_coverages` ADD CONSTRAINT `live_coverages_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `live_coverages` ADD CONSTRAINT `live_coverages_author_id_authors_id_fk` FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `live_coverages` ADD CONSTRAINT `live_coverages_cover_media_id_media_assets_id_fk` FOREIGN KEY (`cover_media_id`) REFERENCES `media_assets`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `live_coverages` ADD CONSTRAINT `live_coverages_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `live_coverages` ADD CONSTRAINT `live_coverages_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `live_coverage_updates` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`coverage_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`body_html` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`body_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`event_at` datetime(3) NOT NULL,
	`is_important` boolean NOT NULL DEFAULT false,
	`status` enum('draft','published','withdrawn') NOT NULL DEFAULT 'draft',
	`author_user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`source_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`media_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`media_caption` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`published_at` datetime(3),
	`withdrawn_at` datetime(3),
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `live_coverage_updates_id` PRIMARY KEY(`id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `live_cov_upd_coverage_status_idx` ON `live_coverage_updates` (`coverage_id`,`status`,`event_at`);
--> statement-breakpoint
CREATE INDEX `live_cov_upd_published_idx` ON `live_coverage_updates` (`status`,`published_at`);
--> statement-breakpoint
ALTER TABLE `live_coverage_updates` ADD CONSTRAINT `live_coverage_updates_coverage_id_live_coverages_id_fk` FOREIGN KEY (`coverage_id`) REFERENCES `live_coverages`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `live_coverage_updates` ADD CONSTRAINT `live_coverage_updates_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `live_coverage_updates` ADD CONSTRAINT `live_coverage_updates_media_id_media_assets_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media_assets`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`body` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`entity_type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`entity_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`severity` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
	`is_read` boolean NOT NULL DEFAULT false,
	`read_at` datetime(3),
	`dedupe_key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `notifications_user_unread_idx` ON `notifications` (`user_id`,`is_read`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_uq` ON `notifications` (`user_id`,`dedupe_key`);
--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `page_view_daily` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`entity_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`entity_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`day` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`views` int NOT NULL DEFAULT 0,
	`unique_sessions` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `page_view_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `page_view_daily_uq` UNIQUE(`entity_type`,`entity_id`,`day`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `page_view_daily_day_idx` ON `page_view_daily` (`day`);
--> statement-breakpoint
CREATE TABLE `page_view_sessions` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`session_hash` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`entity_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`entity_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`day` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `page_view_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `page_view_sessions_uq` UNIQUE(`session_hash`,`entity_type`,`entity_id`,`day`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `page_view_sessions_day_idx` ON `page_view_sessions` (`day`);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`prefs_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_user_id` PRIMARY KEY(`user_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `articles` MODIFY COLUMN `status` enum('draft','in_review','returned','approved','scheduled','published','archived','rejected') NOT NULL DEFAULT 'draft';
