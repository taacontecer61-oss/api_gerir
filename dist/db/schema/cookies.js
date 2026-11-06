import { boolean, datetime, index, int, mysqlTable, text, timestamp, uniqueIndex, varchar, } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { users } from './auth.js';
/** Categorias de cookies e tecnologias semelhantes. */
export const cookieCategories = mysqlTable('cookie_categories', {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    description: text('description').notNull(),
    purpose: text('purpose').notNull(),
    examples: text('examples').notNull(),
    isEssential: boolean('is_essential').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: int('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [uniqueIndex('cookie_categories_slug_uq').on(table.slug)]);
/** Inventário verificado de cookies, armazenamento local e recursos externos. */
export const cookieInventory = mysqlTable('cookie_inventory', {
    id: varchar('id', { length: 36 }).primaryKey(),
    categoryId: varchar('category_id', { length: 36 })
        .notNull()
        .references(() => cookieCategories.id, { onDelete: 'restrict' }),
    cookieName: varchar('cookie_name', { length: 120 }).notNull(),
    provider: varchar('provider', { length: 120 }).notNull(),
    purpose: varchar('purpose', { length: 500 }).notNull(),
    duration: varchar('duration', { length: 120 }).notNull(),
    domain: varchar('domain', { length: 191 }).notNull(),
    cookieType: varchar('cookie_type', { length: 32 }).notNull(),
    requiresConsent: boolean('requires_consent').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    usedOn: varchar('used_on', { length: 255 }).notNull(),
    gateKey: varchar('gate_key', { length: 64 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('cookie_inventory_name_domain_uq').on(table.cookieName, table.domain),
    uniqueIndex('cookie_inventory_gate_uq').on(table.gateKey),
    index('cookie_inventory_category_idx').on(table.categoryId),
]);
/**
 * Integrações externas conhecidas. Não guarda código arbitrário:
 * apenas um tipo fechado e um identificador público validado.
 */
export const cookieIntegrations = mysqlTable('cookie_integrations', {
    id: varchar('id', { length: 36 }).primaryKey(),
    categoryId: varchar('category_id', { length: 36 })
        .notNull()
        .references(() => cookieCategories.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    provider: varchar('provider', { length: 120 }).notNull(),
    integrationType: varchar('integration_type', { length: 32 }).notNull(),
    publicId: varchar('public_id', { length: 64 }).notNull().default(''),
    purpose: varchar('purpose', { length: 500 }).notNull(),
    requiresConsent: boolean('requires_consent').notNull().default(true),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('cookie_integrations_slug_uq').on(table.slug),
    index('cookie_integrations_category_idx').on(table.categoryId),
]);
export const cookiePolicyVersions = mysqlTable('cookie_policy_versions', {
    id: varchar('id', { length: 36 }).primaryKey(),
    version: varchar('version', { length: 32 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    content: text('content').notNull(),
    changeSummary: varchar('change_summary', { length: 500 }).notNull(),
    requiresReconsent: boolean('requires_reconsent').notNull().default(true),
    isPublished: boolean('is_published').notNull().default(false),
    effectiveAt: datetime('effective_at', { mode: 'date', fsp: 3 }),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }),
    createdBy: varchar('created_by', { length: 36 }).references(() => users.id, {
        onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('cookie_policy_versions_version_uq').on(table.version),
    index('cookie_policy_versions_published_idx').on(table.isPublished, table.effectiveAt),
]);
/** Histórico de decisões. O identificador do visitante é pseudónimo e gerado no navegador. */
export const cookieConsents = mysqlTable('cookie_consents', {
    id: varchar('id', { length: 36 }).primaryKey(),
    visitorId: varchar('visitor_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
    consentVersion: varchar('consent_version', { length: 16 }).notNull(),
    policyVersion: varchar('policy_version', { length: 32 }).notNull(),
    necessary: boolean('necessary').notNull().default(true),
    preferences: boolean('preferences').notNull().default(false),
    analytics: boolean('analytics').notNull().default(false),
    marketing: boolean('marketing').notNull().default(false),
    personalization: boolean('personalization').notNull().default(false),
    action: varchar('action', { length: 32 }).notNull(),
    jurisdiction: varchar('jurisdiction', { length: 16 }).notNull(),
    day: varchar('day', { length: 10 }).notNull(),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
}, (table) => [
    index('cookie_consents_visitor_idx').on(table.visitorId, table.createdAt),
    index('cookie_consents_day_idx').on(table.day),
    index('cookie_consents_expires_idx').on(table.expiresAt),
]);
/** Aviso apresentado. Não é um consentimento. */
export const cookieNoticeReceipts = mysqlTable('cookie_notice_receipts', {
    id: varchar('id', { length: 36 }).primaryKey(),
    visitorId: varchar('visitor_id', { length: 36 }).notNull(),
    policyVersion: varchar('policy_version', { length: 32 }).notNull(),
    day: varchar('day', { length: 10 }).notNull(),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('cookie_notice_receipts_uq').on(table.visitorId, table.policyVersion),
    index('cookie_notice_receipts_day_idx').on(table.day),
]);
