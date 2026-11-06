import { boolean, datetime, index, int, mysqlTable, text, timestamp, uniqueIndex, varchar, } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { users } from './auth.js';
/** Notificações internas da redação. */
export const notifications = mysqlTable('notifications', {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: varchar('body', { length: 500 }),
    entityType: varchar('entity_type', { length: 64 }),
    entityId: varchar('entity_id', { length: 36 }),
    severity: varchar('severity', { length: 16 }).notNull().default('info'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: datetime('read_at', { mode: 'date', fsp: 3 }),
    dedupeKey: varchar('dedupe_key', { length: 191 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    index('notifications_user_unread_idx').on(table.userId, table.isRead, table.createdAt),
    uniqueIndex('notifications_dedupe_uq').on(table.userId, table.dedupeKey),
]);
/**
 * Contadores diários de visualizações (privacidade: sem PII).
 * entityType: article | live_coverage | video | gallery
 */
export const pageViewDaily = mysqlTable('page_view_daily', {
    id: varchar('id', { length: 36 }).primaryKey(),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    day: varchar('day', { length: 10 }).notNull(),
    views: int('views').notNull().default(0),
    uniqueSessions: int('unique_sessions').notNull().default(0),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('page_view_daily_uq').on(table.entityType, table.entityId, table.day),
    index('page_view_daily_day_idx').on(table.day),
]);
/** Sessões anónimas hashed (TTL curto) para aproximar visitantes únicos no dia. */
export const pageViewSessions = mysqlTable('page_view_sessions', {
    id: varchar('id', { length: 36 }).primaryKey(),
    sessionHash: varchar('session_hash', { length: 64 }).notNull(),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    day: varchar('day', { length: 10 }).notNull(),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('page_view_sessions_uq').on(table.sessionHash, table.entityType, table.entityId, table.day),
    index('page_view_sessions_day_idx').on(table.day),
]);
/**
 * Contadores diários de visualizações por país (ISO 3166-1 alpha-2).
 * Sem IP nem PII — apenas agregados. «XX» = país desconhecido.
 */
export const pageViewCountries = mysqlTable('page_view_countries', {
    id: varchar('id', { length: 36 }).primaryKey(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    day: varchar('day', { length: 10 }).notNull(),
    views: int('views').notNull().default(0),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('page_view_countries_uq').on(table.countryCode, table.day),
    index('page_view_countries_day_idx').on(table.day),
]);
export const notificationPreferences = mysqlTable('notification_preferences', {
    userId: varchar('user_id', { length: 36 })
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    prefsJson: text('prefs_json').notNull(),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
});
