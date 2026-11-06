import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  notifications,
  permissions,
  rolePermissions,
  userRoles,
  users,
} from '../db/schema/index.js'
import { newId } from '../lib/ids.js'
import type { PermissionSlug } from '../lib/permissions.js'

export async function notifyUsersWithPermission(input: {
  permission: PermissionSlug
  type: string
  title: string
  body?: string
  entityType?: string
  entityId?: string
  severity?: 'info' | 'warning' | 'critical'
  dedupeKey?: string
  excludeUserId?: string
}) {
  const recipients = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(users.isActive, true), eq(permissions.slug, input.permission)))

  for (const recipient of recipients) {
    if (recipient.id === input.excludeUserId) continue
    await createNotification({
      userId: recipient.id,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      severity: input.severity ?? 'info',
      dedupeKey: input.dedupeKey,
    })
  }
}

export async function notifyUsersWithPermissionSafe(
  input: Parameters<typeof notifyUsersWithPermission>[0],
) {
  try {
    await notifyUsersWithPermission(input)
  } catch {
    return
  }
}

export async function createNotification(input: {
  userId: string
  type: string
  title: string
  body?: string
  entityType?: string
  entityId?: string
  severity?: 'info' | 'warning' | 'critical'
  dedupeKey?: string
}) {
  if (input.dedupeKey) {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(eq(notifications.userId, input.userId), eq(notifications.dedupeKey, input.dedupeKey)),
      )
      .limit(1)
    if (existing) return existing
  }

  const id = newId()
  try {
    await db.insert(notifications).values({
      id,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      severity: input.severity ?? 'info',
      dedupeKey: input.dedupeKey ?? null,
    })
  } catch {
    return null
  }
  return { id }
}

export async function listNotifications(
  userId: string,
  opts?: { unreadOnly?: boolean; limit?: number },
) {
  const filters = [eq(notifications.userId, userId)]
  if (opts?.unreadOnly) filters.push(eq(notifications.isRead, false))
  return db
    .select()
    .from(notifications)
    .where(and(...filters))
    .orderBy(desc(notifications.createdAt))
    .limit(opts?.limit ?? 40)
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const now = new Date()
  if (ids?.length) {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)))
  } else {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
  }
  return { ok: true }
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
  return Number(row?.total ?? 0)
}
