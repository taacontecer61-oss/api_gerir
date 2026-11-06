import { boolean, datetime, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar, } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { categories } from './taxonomy.js';
import { mediaAssets } from './media.js';
import { users } from './auth.js';
/** Cobertura jornalística em directo (liveblog), distinta de streaming AV. */
export const liveCoverages = mysqlTable('live_coverages', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 191 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    summary: text('summary').notNull(),
    descriptionHtml: text('description_html'),
    categoryId: varchar('category_id', { length: 36 })
        .notNull()
        .references(() => categories.id, { onDelete: 'restrict' }),
    authorUserId: varchar('author_user_id', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    authorName: varchar('author_name', { length: 160 }).notNull().default(''),
    coverMediaId: varchar('cover_media_id', { length: 36 }).references(() => mediaAssets.id, {
        onDelete: 'set null',
    }),
    coverAlt: varchar('cover_alt', { length: 255 }),
    status: mysqlEnum('status', [
        'preparation',
        'scheduled',
        'live',
        'paused',
        'ended',
        'archived',
    ])
        .notNull()
        .default('preparation'),
    featured: boolean('featured').notNull().default(false),
    seoTitle: varchar('seo_title', { length: 255 }),
    seoDescription: varchar('seo_description', { length: 320 }),
    noindex: boolean('noindex').notNull().default(false),
    /** Incorporação pública (ex.: YouTube Live). Nunca guardar chaves RTMP aqui. */
    streamEmbedUrl: varchar('stream_embed_url', { length: 500 }),
    streamProvider: varchar('stream_provider', { length: 64 }),
    streamStatus: varchar('stream_status', { length: 32 }),
    scheduledStartAt: datetime('scheduled_start_at', { mode: 'date', fsp: 3 }),
    startedAt: datetime('started_at', { mode: 'date', fsp: 3 }),
    endedAt: datetime('ended_at', { mode: 'date', fsp: 3 }),
    lastUpdateAt: datetime('last_update_at', { mode: 'date', fsp: 3 }),
    version: int('version').notNull().default(1),
    createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    deletedAt: datetime('deleted_at', { mode: 'date', fsp: 3 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('live_coverages_slug_uq').on(table.slug),
    index('live_coverages_status_idx').on(table.status, table.lastUpdateAt),
    index('live_coverages_category_idx').on(table.categoryId),
    index('live_coverages_author_user_idx').on(table.authorUserId),
]);
export const liveCoverageUpdates = mysqlTable('live_coverage_updates', {
    id: varchar('id', { length: 36 }).primaryKey(),
    coverageId: varchar('coverage_id', { length: 36 })
        .notNull()
        .references(() => liveCoverages.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    bodyHtml: text('body_html').notNull(),
    bodyJson: text('body_json'),
    eventAt: datetime('event_at', { mode: 'date', fsp: 3 }).notNull(),
    isImportant: boolean('is_important').notNull().default(false),
    status: mysqlEnum('status', ['draft', 'published', 'withdrawn']).notNull().default('draft'),
    authorUserId: varchar('author_user_id', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    sourceUrl: varchar('source_url', { length: 500 }),
    mediaId: varchar('media_id', { length: 36 }).references(() => mediaAssets.id, {
        onDelete: 'set null',
    }),
    mediaCaption: varchar('media_caption', { length: 255 }),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }),
    withdrawnAt: datetime('withdrawn_at', { mode: 'date', fsp: 3 }),
    version: int('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    index('live_cov_upd_coverage_status_idx').on(table.coverageId, table.status, table.eventAt),
    index('live_cov_upd_published_idx').on(table.status, table.publishedAt),
]);
