import { boolean, datetime, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar, } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { categories } from './taxonomy.js';
import { mediaAssets } from './media.js';
import { users } from './auth.js';
export const articleStatusEnum = mysqlEnum('status', [
    'draft',
    'in_review',
    'returned',
    'approved',
    'scheduled',
    'published',
    'archived',
    'rejected',
]);
export const articles = mysqlTable('articles', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 191 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    subtitle: varchar('subtitle', { length: 255 }),
    summary: text('summary').notNull(),
    contentJson: text('content_json').notNull(),
    contentHtml: text('content_html').notNull(),
    status: articleStatusEnum.notNull().default('draft'),
    categoryId: varchar('category_id', { length: 36 })
        .notNull()
        .references(() => categories.id, { onDelete: 'restrict' }),
    /** Conta que assina a notícia. Nulo se a conta tiver sido eliminada. */
    authorUserId: varchar('author_user_id', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    /** Nome apresentado no portal, conservado mesmo sem a conta. */
    authorName: varchar('author_name', { length: 160 }).notNull().default(''),
    editorUserId: varchar('editor_user_id', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    approvedByUserId: varchar('approved_by_user_id', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    publishedByUserId: varchar('published_by_user_id', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    coverMediaId: varchar('cover_media_id', { length: 36 }).references(() => mediaAssets.id, {
        onDelete: 'set null',
    }),
    coverAlt: varchar('cover_alt', { length: 255 }),
    coverCaption: varchar('cover_caption', { length: 255 }),
    readingTimeMinutes: int('reading_time_minutes').notNull().default(1),
    featured: boolean('featured').notNull().default(false),
    highlight: boolean('highlight').notNull().default(false),
    seoTitle: varchar('seo_title', { length: 255 }),
    seoDescription: varchar('seo_description', { length: 320 }),
    noindex: boolean('noindex').notNull().default(false),
    ogImageMediaId: varchar('og_image_media_id', { length: 36 }),
    credits: text('credits'),
    /** Fontes da informação (texto livre / lista). */
    sources: text('sources'),
    /** Localização do acontecimento. */
    location: varchar('location', { length: 255 }),
    version: int('version').notNull().default(1),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }),
    scheduledAt: datetime('scheduled_at', { mode: 'date', fsp: 3 }),
    archivedAt: datetime('archived_at', { mode: 'date', fsp: 3 }),
    deletedAt: datetime('deleted_at', { mode: 'date', fsp: 3 }),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    updatedByUserId: varchar('updated_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('articles_slug_uq').on(table.slug),
    index('articles_status_published_idx').on(table.status, table.publishedAt),
    index('articles_public_list_idx').on(table.status, table.deletedAt, table.publishedAt),
    index('articles_category_published_idx').on(table.categoryId, table.publishedAt),
    index('articles_author_user_updated_idx').on(table.authorUserId, table.updatedAt),
    index('articles_scheduled_idx').on(table.status, table.scheduledAt),
]);
export const articleTags = mysqlTable('article_tags', {
    articleId: varchar('article_id', { length: 36 }).notNull(),
    tagId: varchar('tag_id', { length: 36 }).notNull(),
}, (table) => [
    uniqueIndex('article_tags_uq').on(table.articleId, table.tagId),
    index('article_tags_tag_idx').on(table.tagId),
]);
export const articleRevisions = mysqlTable('article_revisions', {
    id: varchar('id', { length: 36 }).primaryKey(),
    articleId: varchar('article_id', { length: 36 }).notNull(),
    version: int('version').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    changedByUserId: varchar('changed_by_user_id', { length: 36 }),
    changeReason: varchar('change_reason', { length: 160 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('article_revisions_uq').on(table.articleId, table.version),
    index('article_revisions_article_idx').on(table.articleId),
]);
export const articleRelations = mysqlTable('article_relations', {
    articleId: varchar('article_id', { length: 36 }).notNull(),
    relatedArticleId: varchar('related_article_id', { length: 36 }).notNull(),
    sortOrder: int('sort_order').notNull().default(0),
}, (table) => [
    uniqueIndex('article_relations_uq').on(table.articleId, table.relatedArticleId),
]);
/** Categorias secundárias (a principal fica em articles.category_id). */
export const articleSecondaryCategories = mysqlTable('article_secondary_categories', {
    articleId: varchar('article_id', { length: 36 }).notNull(),
    categoryId: varchar('category_id', { length: 36 }).notNull(),
}, (table) => [
    uniqueIndex('article_secondary_cats_uq').on(table.articleId, table.categoryId),
    index('article_secondary_cats_cat_idx').on(table.categoryId),
]);
/** Galeria de imagens associada a um artigo (além da capa). */
export const articleGalleryItems = mysqlTable('article_gallery_items', {
    id: varchar('id', { length: 36 }).primaryKey(),
    articleId: varchar('article_id', { length: 36 }).notNull(),
    mediaId: varchar('media_id', { length: 36 }).notNull(),
    caption: varchar('caption', { length: 255 }),
    sortOrder: int('sort_order').notNull().default(0),
}, (table) => [
    index('article_gallery_article_idx').on(table.articleId),
]);
export const redirects = mysqlTable('redirects', {
    id: varchar('id', { length: 36 }).primaryKey(),
    fromPath: varchar('from_path', { length: 255 }).notNull(),
    toPath: varchar('to_path', { length: 255 }).notNull(),
    httpStatus: int('http_status').notNull().default(301),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('redirects_from_uq').on(table.fromPath),
]);
