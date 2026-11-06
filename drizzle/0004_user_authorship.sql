ALTER TABLE `articles`
  ADD COLUMN `author_user_id` varchar(36) NULL AFTER `author_id`,
  ADD COLUMN `author_name` varchar(160) NOT NULL DEFAULT '' AFTER `author_user_id`,
  ADD COLUMN `approved_by_user_id` varchar(36) NULL AFTER `editor_user_id`,
  ADD COLUMN `published_by_user_id` varchar(36) NULL AFTER `approved_by_user_id`;
--> statement-breakpoint
UPDATE `articles` AS a
INNER JOIN `authors` AS au ON au.`id` = a.`author_id`
SET a.`author_name` = au.`name`,
    a.`author_user_id` = au.`user_id`;
--> statement-breakpoint
UPDATE `articles` SET `author_name` = 'Redacção' WHERE `author_name` = '';
--> statement-breakpoint
ALTER TABLE `articles` DROP FOREIGN KEY `articles_author_id_authors_id_fk`;
--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `author_id`;
--> statement-breakpoint
ALTER TABLE `articles`
  ADD CONSTRAINT `articles_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `articles`
  ADD CONSTRAINT `articles_approved_by_user_id_users_id_fk` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `articles`
  ADD CONSTRAINT `articles_published_by_user_id_users_id_fk` FOREIGN KEY (`published_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX `articles_author_user_updated_idx` ON `articles` (`author_user_id`, `updated_at`);
--> statement-breakpoint
ALTER TABLE `live_coverages`
  ADD COLUMN `author_user_id` varchar(36) NULL AFTER `author_id`,
  ADD COLUMN `author_name` varchar(160) NOT NULL DEFAULT '' AFTER `author_user_id`;
--> statement-breakpoint
UPDATE `live_coverages` AS c
INNER JOIN `authors` AS au ON au.`id` = c.`author_id`
SET c.`author_name` = au.`name`,
    c.`author_user_id` = au.`user_id`;
--> statement-breakpoint
UPDATE `live_coverages` SET `author_name` = 'Redacção' WHERE `author_name` = '';
--> statement-breakpoint
ALTER TABLE `live_coverages` DROP FOREIGN KEY `live_coverages_author_id_authors_id_fk`;
--> statement-breakpoint
ALTER TABLE `live_coverages` DROP COLUMN `author_id`;
--> statement-breakpoint
ALTER TABLE `live_coverages`
  ADD CONSTRAINT `live_coverages_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX `live_coverages_author_user_idx` ON `live_coverages` (`author_user_id`);
