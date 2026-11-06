ALTER TABLE `articles` MODIFY `content_json` mediumtext NOT NULL;
--> statement-breakpoint
ALTER TABLE `articles` MODIFY `content_html` mediumtext NOT NULL;
--> statement-breakpoint
ALTER TABLE `articles` MODIFY `summary` mediumtext NOT NULL;
