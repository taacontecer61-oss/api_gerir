UPDATE `articles` AS a
INNER JOIN `users` AS u ON u.`id` = a.`created_by_user_id`
SET a.`author_user_id` = u.`id`,
    a.`author_name` = u.`name`
WHERE a.`author_user_id` IS NULL;
--> statement-breakpoint
UPDATE `live_coverages` AS c
INNER JOIN `users` AS u ON u.`id` = c.`created_by_user_id`
SET c.`author_user_id` = u.`id`,
    c.`author_name` = u.`name`
WHERE c.`author_user_id` IS NULL;
--> statement-breakpoint
UPDATE `articles`
SET `published_by_user_id` = COALESCE(`updated_by_user_id`, `created_by_user_id`)
WHERE `published_by_user_id` IS NULL
  AND `status` IN ('published', 'scheduled');
