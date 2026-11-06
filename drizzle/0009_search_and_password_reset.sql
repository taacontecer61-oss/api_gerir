DROP TABLE IF EXISTS `password_resets`;
--> statement-breakpoint
CREATE TABLE `password_resets` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `used_at` datetime(3) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `password_resets_id` PRIMARY KEY(`id`),
  CONSTRAINT `password_resets_token_uq` UNIQUE(`token_hash`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `password_resets_user_idx` ON `password_resets` (`user_id`);
--> statement-breakpoint
ALTER TABLE `password_resets` ADD CONSTRAINT `password_resets_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE FULLTEXT INDEX `articles_search_ft` ON `articles` (`title`, `subtitle`, `summary`);
