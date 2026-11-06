import { int, mysqlTable, timestamp, index, uniqueIndex, varchar, } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
export const mediaAssets = mysqlTable('media_assets', {
    id: varchar('id', { length: 36 }).primaryKey(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    width: int('width'),
    height: int('height'),
    storageKey: varchar('storage_key', { length: 255 }).notNull(),
    altText: varchar('alt_text', { length: 255 }),
    caption: varchar('caption', { length: 255 }),
    credit: varchar('credit', { length: 255 }),
    uploadedByUserId: varchar('uploaded_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('media_assets_storage_key_uq').on(table.storageKey),
]);
export const mediaUsages = mysqlTable('media_usages', {
    id: varchar('id', { length: 36 }).primaryKey(),
    mediaId: varchar('media_id', { length: 36 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    usageKind: varchar('usage_kind', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('media_usages_uq').on(table.mediaId, table.entityType, table.entityId, table.usageKind),
    index('media_usages_entity_idx').on(table.entityType, table.entityId),
]);
