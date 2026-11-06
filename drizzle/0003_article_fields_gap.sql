ALTER TABLE `articles`
  ADD COLUMN `sources` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER `credits`,
  ADD COLUMN `location` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER `sources`;
--> statement-breakpoint
ALTER TABLE `categories`
  ADD COLUMN `seo_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER `description`,
  ADD COLUMN `seo_description` varchar(320) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER `seo_title`;
--> statement-breakpoint
CREATE TABLE `article_secondary_categories` (
	`article_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`category_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	CONSTRAINT `article_secondary_cats_uq` UNIQUE(`article_id`,`category_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `article_secondary_cats_cat_idx` ON `article_secondary_categories` (`category_id`);
--> statement-breakpoint
CREATE TABLE `article_gallery_items` (
	`id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`article_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`media_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
	`caption` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `article_gallery_items_id` PRIMARY KEY(`id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `article_gallery_article_idx` ON `article_gallery_items` (`article_id`);
