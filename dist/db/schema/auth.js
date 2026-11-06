import { boolean, datetime, index, int, mysqlTable, text, timestamp, uniqueIndex, varchar, } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
export const roles = mysqlTable('roles', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 255 }),
    isSystem: boolean('is_system').notNull().default(true),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('roles_slug_uq').on(table.slug),
]);
export const permissions = mysqlTable('permissions', {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 96 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
}, (table) => [
    uniqueIndex('permissions_slug_uq').on(table.slug),
]);
export const rolePermissions = mysqlTable('role_permissions', {
    roleId: varchar('role_id', { length: 36 })
        .notNull()
        .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: varchar('permission_id', { length: 36 })
        .notNull()
        .references(() => permissions.id, { onDelete: 'cascade' }),
}, (table) => [
    uniqueIndex('role_permissions_uq').on(table.roleId, table.permissionId),
    index('role_permissions_role_idx').on(table.roleId),
]);
export const users = mysqlTable('users', {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 191 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: datetime('last_login_at', { mode: 'date', fsp: 3 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
        .notNull()
        .default(sql `CURRENT_TIMESTAMP`)
        .onUpdateNow(),
}, (table) => [
    uniqueIndex('users_email_uq').on(table.email),
]);
export const userRoles = mysqlTable('user_roles', {
    userId: varchar('user_id', { length: 36 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    roleId: varchar('role_id', { length: 36 })
        .notNull()
        .references(() => roles.id, { onDelete: 'restrict' }),
}, (table) => [
    uniqueIndex('user_roles_uq').on(table.userId, table.roleId),
    index('user_roles_user_idx').on(table.userId),
]);
export const sessions = mysqlTable('sessions', {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
    revokedAt: datetime('revoked_at', { mode: 'date', fsp: 3 }),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
}, (table) => [
    uniqueIndex('sessions_token_hash_uq').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt),
]);
export const loginAttempts = mysqlTable('login_attempts', {
    id: int('id').autoincrement().primaryKey(),
    email: varchar('email', { length: 191 }).notNull(),
    ip: varchar('ip', { length: 64 }),
    succeeded: boolean('succeeded').notNull().default(false),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    index('login_attempts_email_created_idx').on(table.email, table.createdAt),
]);
export const auditLogs = mysqlTable('audit_logs', {
    id: varchar('id', { length: 36 }).primaryKey(),
    actorUserId: varchar('actor_user_id', { length: 36 }),
    action: varchar('action', { length: 96 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }),
    entityId: varchar('entity_id', { length: 36 }),
    metaJson: text('meta_json'),
    ip: varchar('ip', { length: 64 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    index('audit_logs_created_idx').on(table.createdAt),
    index('audit_logs_actor_idx').on(table.actorUserId),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
]);
export const passwordResets = mysqlTable('password_resets', {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    usedAt: datetime('used_at', { mode: 'date', fsp: 3 }),
    createdAt: timestamp('created_at').notNull().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    uniqueIndex('password_resets_token_uq').on(table.tokenHash),
    index('password_resets_user_idx').on(table.userId),
]);
