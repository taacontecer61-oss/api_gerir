CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL,
	`actor_user_id` varchar(36),
	`action` varchar(96) NOT NULL,
	`entity_type` varchar(64),
	`entity_id` varchar(36),
	`meta_json` text,
	`ip` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`ip` varchar(64),
	`succeeded` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`description` varchar(255) NOT NULL,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` varchar(36) NOT NULL,
	`permission_id` varchar(36) NOT NULL,
	CONSTRAINT `role_permissions_uq` UNIQUE(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(255),
	`is_system` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`revoked_at` datetime(3),
	`ip` varchar(64),
	`user_agent` varchar(255),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` varchar(36) NOT NULL,
	`role_id` varchar(36) NOT NULL,
	CONSTRAINT `user_roles_uq` UNIQUE(`user_id`,`role_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(191) NOT NULL,
	`name` varchar(160) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`last_login_at` datetime(3),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `authors` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(160) NOT NULL,
	`role_label` varchar(160) NOT NULL,
	`bio` text,
	`user_id` varchar(36),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `authors_id` PRIMARY KEY(`id`),
	CONSTRAINT `authors_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(120) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_slug_uq` UNIQUE(`slug`),
	CONSTRAINT `tags_name_uq` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` varchar(36) NOT NULL,
	`original_name` varchar(255) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`size_bytes` int NOT NULL,
	`width` int,
	`height` int,
	`storage_key` varchar(255) NOT NULL,
	`alt_text` varchar(255),
	`caption` varchar(255),
	`credit` varchar(255),
	`uploaded_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `media_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_assets_storage_key_uq` UNIQUE(`storage_key`)
);
--> statement-breakpoint
CREATE TABLE `media_usages` (
	`id` varchar(36) NOT NULL,
	`media_id` varchar(36) NOT NULL,
	`entity_type` varchar(64) NOT NULL,
	`entity_id` varchar(36) NOT NULL,
	`usage_kind` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `media_usages_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_usages_uq` UNIQUE(`media_id`,`entity_type`,`entity_id`,`usage_kind`)
);
--> statement-breakpoint
CREATE TABLE `article_relations` (
	`article_id` varchar(36) NOT NULL,
	`related_article_id` varchar(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `article_relations_uq` UNIQUE(`article_id`,`related_article_id`)
);
--> statement-breakpoint
CREATE TABLE `article_revisions` (
	`id` varchar(36) NOT NULL,
	`article_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`snapshot_json` text NOT NULL,
	`changed_by_user_id` varchar(36),
	`change_reason` varchar(160),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `article_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `article_revisions_uq` UNIQUE(`article_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `article_tags` (
	`article_id` varchar(36) NOT NULL,
	`tag_id` varchar(36) NOT NULL,
	CONSTRAINT `article_tags_uq` UNIQUE(`article_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`title` varchar(255) NOT NULL,
	`subtitle` varchar(255),
	`summary` text NOT NULL,
	`content_json` text NOT NULL,
	`content_html` text NOT NULL,
	`status` enum('draft','in_review','returned','approved','scheduled','published','archived') NOT NULL DEFAULT 'draft',
	`category_id` varchar(36) NOT NULL,
	`author_id` varchar(36) NOT NULL,
	`editor_user_id` varchar(36),
	`cover_media_id` varchar(36),
	`cover_alt` varchar(255),
	`cover_caption` varchar(255),
	`reading_time_minutes` int NOT NULL DEFAULT 1,
	`featured` boolean NOT NULL DEFAULT false,
	`highlight` boolean NOT NULL DEFAULT false,
	`seo_title` varchar(255),
	`seo_description` varchar(320),
	`noindex` boolean NOT NULL DEFAULT false,
	`og_image_media_id` varchar(36),
	`credits` text,
	`version` int NOT NULL DEFAULT 1,
	`published_at` datetime(3),
	`scheduled_at` datetime(3),
	`archived_at` datetime(3),
	`deleted_at` datetime(3),
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `articles_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `redirects` (
	`id` varchar(36) NOT NULL,
	`from_path` varchar(255) NOT NULL,
	`to_path` varchar(255) NOT NULL,
	`http_status` int NOT NULL DEFAULT 301,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `redirects_id` PRIMARY KEY(`id`),
	CONSTRAINT `redirects_from_uq` UNIQUE(`from_path`)
);
--> statement-breakpoint
CREATE TABLE `galleries` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`cover_url` varchar(500) NOT NULL,
	`published_at` datetime(3) NOT NULL,
	`is_published` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `galleries_id` PRIMARY KEY(`id`),
	CONSTRAINT `galleries_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `gallery_photos` (
	`id` varchar(36) NOT NULL,
	`gallery_id` varchar(36) NOT NULL,
	`media_id` varchar(36),
	`src` varchar(500) NOT NULL,
	`alt` varchar(255) NOT NULL,
	`caption` varchar(255),
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `gallery_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `live_updates` (
	`id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`display_time` varchar(16) NOT NULL,
	`published_at` datetime(3) NOT NULL,
	`article_id` varchar(36),
	`is_published` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `live_updates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(96) NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `trending_topics` (
	`id` varchar(36) NOT NULL,
	`position` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`category_id` varchar(36),
	`article_id` varchar(36),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `trending_topics_id` PRIMARY KEY(`id`),
	CONSTRAINT `trending_topics_position_uq` UNIQUE(`position`),
	CONSTRAINT `trending_topics_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`category_id` varchar(36) NOT NULL,
	`duration` varchar(16) NOT NULL,
	`thumbnail_url` varchar(500) NOT NULL,
	`source_url` varchar(500),
	`published_at` datetime(3) NOT NULL,
	`is_published` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videos_id` PRIMARY KEY(`id`),
	CONSTRAINT `videos_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `articles` ADD CONSTRAINT `articles_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `articles` ADD CONSTRAINT `articles_author_id_authors_id_fk` FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `articles` ADD CONSTRAINT `articles_editor_user_id_users_id_fk` FOREIGN KEY (`editor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `articles` ADD CONSTRAINT `articles_cover_media_id_media_assets_id_fk` FOREIGN KEY (`cover_media_id`) REFERENCES `media_assets`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trending_topics` ADD CONSTRAINT `trending_topics_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `videos` ADD CONSTRAINT `videos_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `login_attempts_email_created_idx` ON `login_attempts` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `role_permissions_role_idx` ON `role_permissions` (`role_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `user_roles_user_idx` ON `user_roles` (`user_id`);--> statement-breakpoint
CREATE INDEX `article_revisions_article_idx` ON `article_revisions` (`article_id`);--> statement-breakpoint
CREATE INDEX `article_tags_tag_idx` ON `article_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `articles_status_published_idx` ON `articles` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `articles_category_published_idx` ON `articles` (`category_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `articles_author_updated_idx` ON `articles` (`author_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `articles_scheduled_idx` ON `articles` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `gallery_photos_gallery_idx` ON `gallery_photos` (`gallery_id`);--> statement-breakpoint
CREATE INDEX `live_updates_published_idx` ON `live_updates` (`is_published`,`published_at`);--> statement-breakpoint
CREATE INDEX `videos_published_idx` ON `videos` (`is_published`,`published_at`);