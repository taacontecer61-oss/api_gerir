import { and, count, desc, eq, gte, like, lte, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { auditLogs, users } from '../db/schema/index.js';
import { badRequest } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { paginateMeta } from '../lib/pagination.js';
import { invalidatePublicContent } from '../lib/cache.js';
export async function writeAuditLog(input) {
    await db.insert(auditLogs).values({
        id: newId(),
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metaJson: input.meta ? JSON.stringify(input.meta) : null,
        ip: input.ip ?? null,
    });
    if (input.entityType === 'article' ||
        input.entityType === 'gallery' ||
        input.entityType === 'video' ||
        input.entityType === 'live_coverage' ||
        input.entityType === 'live_coverage_update' ||
        input.entityType === 'category' ||
        input.entityType === 'tag' ||
        input.entityType === 'settings' ||
        input.entityType === 'redirect') {
        void invalidatePublicContent();
    }
}
export async function listAuditLogs(input) {
    const filters = [];
    if (input.action)
        filters.push(like(auditLogs.action, `${input.action.replace(/[\\%_]/g, '\\$&')}%`));
    if (input.entityType)
        filters.push(eq(auditLogs.entityType, input.entityType));
    if (input.entityId)
        filters.push(eq(auditLogs.entityId, input.entityId));
    if (input.actorUserId)
        filters.push(eq(auditLogs.actorUserId, input.actorUserId));
    if (input.from) {
        const from = new Date(input.from);
        if (Number.isNaN(from.getTime()))
            throw badRequest('INVALID_DATE', 'Data «from» inválida.');
        filters.push(gte(auditLogs.createdAt, from));
    }
    if (input.to) {
        const to = new Date(input.to);
        if (Number.isNaN(to.getTime()))
            throw badRequest('INVALID_DATE', 'Data «to» inválida.');
        filters.push(lte(auditLogs.createdAt, to));
    }
    if (input.q?.trim()) {
        const pattern = `%${input.q.trim().replace(/[\\%_]/g, '\\$&')}%`;
        filters.push(or(like(auditLogs.action, pattern), like(users.name, pattern), like(users.email, pattern)));
    }
    const where = filters.length ? and(...filters) : undefined;
    const [totalRow] = await db
        .select({ total: count() })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorUserId, users.id))
        .where(where);
    const meta = paginateMeta(Number(totalRow.total), input.page, input.pageSize);
    const rows = await db
        .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorUserId: auditLogs.actorUserId,
        actorName: users.name,
        metaJson: auditLogs.metaJson,
        createdAt: auditLogs.createdAt,
    })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorUserId, users.id))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    const items = rows.map(({ metaJson, ...row }) => {
        let meta = null;
        if (metaJson) {
            try {
                meta = JSON.parse(metaJson);
            }
            catch {
                meta = null;
            }
        }
        return { ...row, meta };
    });
    return { items, ...meta };
}
