CREATE INDEX `articles_public_list_idx` ON `articles` (`status`, `deleted_at`, `published_at`);
--> statement-breakpoint
CREATE INDEX `media_usages_entity_idx` ON `media_usages` (`entity_type`, `entity_id`);
--> statement-breakpoint
CREATE INDEX `galleries_published_idx` ON `galleries` (`is_published`, `published_at`);
