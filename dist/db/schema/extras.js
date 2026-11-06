import { boolean, datetime, index, int, mysqlTable, text, timestamp, uniqueIndex, varchar, } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { categories } from './taxonomy.js';
/**
 * @deprecated Legado do protótipo público. Novas coberturas usam live_coverages /
 * live_coverage_updates. Mantido para não destruir dados existentes.
 */
export const liveUpdates = mysqlTable('live_updates', {
    id: varchar('id', { length: 36 }).primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    displayTime: varchar('display_time', { length: 16 }).notNull(),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }).notNull(),
    articleId: varchar('article_id', { length: 36 }),
    isPublished: boolean('is_published').notNull().default(true),
    sortOrder: int('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    index('live_updates_published_idx').on(table.isPublished, table.publishedAt),
]);
export const trendingTopics = mysqlTable('trending_topics', {
    id: varchar('id', { length: 36 }).primaryKey(),
    position: int('position').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 96 }).notNull(),
    categoryId: varchar('category_id', { length: 36 }).references(() => categories.id, {
        onDelete: 'set null',
    }),
    articleId: varchar('article_id', { length: 36 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('trending_topics_position_uq').on(table.position),
    uniqueIndex('trending_topics_slug_uq').on(table.slug),
]);
export const videos = mysqlTable('videos', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 191 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    categoryId: varchar('category_id', { length: 36 })
        .notNull()
        .references(() => categories.id, { onDelete: 'restrict' }),
    duration: varchar('duration', { length: 16 }).notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 500 }).notNull(),
    sourceUrl: varchar('source_url', { length: 500 }),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }).notNull(),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('videos_slug_uq').on(table.slug),
    index('videos_published_idx').on(table.isPublished, table.publishedAt),
]);
export const galleries = mysqlTable('galleries', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 191 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    coverUrl: varchar('cover_url', { length: 500 }).notNull(),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }).notNull(),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('galleries_slug_uq').on(table.slug),
    index('galleries_published_idx').on(table.isPublished, table.publishedAt),
]);
export const galleryPhotos = mysqlTable('gallery_photos', {
    id: varchar('id', { length: 36 }).primaryKey(),
    galleryId: varchar('gallery_id', { length: 36 }).notNull(),
    mediaId: varchar('media_id', { length: 36 }),
    src: varchar('src', { length: 500 }).notNull(),
    alt: varchar('alt', { length: 255 }).notNull(),
    caption: varchar('caption', { length: 255 }),
    sortOrder: int('sort_order').notNull().default(0),
}, (table) => [
    index('gallery_photos_gallery_idx').on(table.galleryId),
]);
export const settings = mysqlTable('settings', {
    key: varchar('key', { length: 96 }).primaryKey(),
    valueJson: text('value_json').notNull(),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
});
