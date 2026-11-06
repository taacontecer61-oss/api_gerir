import { boolean, int, mysqlTable, text, timestamp, uniqueIndex, varchar, } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
export const categories = mysqlTable('categories', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    seoTitle: varchar('seo_title', { length: 255 }),
    seoDescription: varchar('seo_description', { length: 320 }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: int('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('categories_slug_uq').on(table.slug),
]);
export const tags = mysqlTable('tags', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 96 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('tags_slug_uq').on(table.slug),
    uniqueIndex('tags_name_uq').on(table.name),
]);
export const authors = mysqlTable('authors', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 96 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    roleLabel: varchar('role_label', { length: 160 }).notNull(),
    bio: text('bio'),
    userId: varchar('user_id', { length: 36 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('authors_slug_uq').on(table.slug),
]);
