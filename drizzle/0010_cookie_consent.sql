-- Gestão de cookies e consentimento. Collation alinhada com as tabelas existentes.

CREATE TABLE `cookie_categories` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`name` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`slug` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`purpose` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`examples` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`is_essential` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cookie_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `cookie_categories_slug_uq` UNIQUE(`slug`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `cookie_inventory` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`category_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`cookie_name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`provider` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`purpose` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`duration` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`domain` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`cookie_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`requires_consent` boolean NOT NULL DEFAULT true,
	`is_active` boolean NOT NULL DEFAULT true,
	`used_on` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`gate_key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cookie_inventory_id` PRIMARY KEY(`id`),
	CONSTRAINT `cookie_inventory_name_domain_uq` UNIQUE(`cookie_name`, `domain`),
	CONSTRAINT `cookie_inventory_gate_uq` UNIQUE(`gate_key`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `cookie_inventory_category_idx` ON `cookie_inventory` (`category_id`);
--> statement-breakpoint
ALTER TABLE `cookie_inventory` ADD CONSTRAINT `cookie_inventory_category_fk` FOREIGN KEY (`category_id`) REFERENCES `cookie_categories`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `cookie_integrations` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`category_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`slug` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`provider` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`integration_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`public_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
	`purpose` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`requires_consent` boolean NOT NULL DEFAULT true,
	`is_active` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cookie_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `cookie_integrations_slug_uq` UNIQUE(`slug`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `cookie_integrations_category_idx` ON `cookie_integrations` (`category_id`);
--> statement-breakpoint
ALTER TABLE `cookie_integrations` ADD CONSTRAINT `cookie_integrations_category_fk` FOREIGN KEY (`category_id`) REFERENCES `cookie_categories`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `cookie_policy_versions` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`version` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`title` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`change_summary` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`requires_reconsent` boolean NOT NULL DEFAULT true,
	`is_published` boolean NOT NULL DEFAULT false,
	`effective_at` datetime(3),
	`published_at` datetime(3),
	`created_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `cookie_policy_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `cookie_policy_versions_version_uq` UNIQUE(`version`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `cookie_policy_versions_published_idx` ON `cookie_policy_versions` (`is_published`, `effective_at`);
--> statement-breakpoint
ALTER TABLE `cookie_policy_versions` ADD CONSTRAINT `cookie_policy_versions_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `cookie_consents` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`visitor_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`consent_version` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`policy_version` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`necessary` boolean NOT NULL DEFAULT true,
	`preferences` boolean NOT NULL DEFAULT false,
	`analytics` boolean NOT NULL DEFAULT false,
	`marketing` boolean NOT NULL DEFAULT false,
	`personalization` boolean NOT NULL DEFAULT false,
	`action` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`jurisdiction` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`day` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `cookie_consents_id` PRIMARY KEY(`id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `cookie_consents_visitor_idx` ON `cookie_consents` (`visitor_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `cookie_consents_day_idx` ON `cookie_consents` (`day`);
--> statement-breakpoint
CREATE INDEX `cookie_consents_expires_idx` ON `cookie_consents` (`expires_at`);
--> statement-breakpoint
ALTER TABLE `cookie_consents` ADD CONSTRAINT `cookie_consents_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `cookie_notice_receipts` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`visitor_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`policy_version` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`day` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `cookie_notice_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `cookie_notice_receipts_uq` UNIQUE(`visitor_id`, `policy_version`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `cookie_notice_receipts_day_idx` ON `cookie_notice_receipts` (`day`);
