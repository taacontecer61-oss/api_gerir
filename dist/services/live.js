import { and, count, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { db } from '../db/index.js';
import { categories, liveCoverageUpdates, liveCoverages, mediaUsages, users, } from '../db/schema/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { paginateMeta } from '../lib/pagination.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { isReservedSlug } from '../lib/reserved-slugs.js';
import { sanitizeArticleHtml } from '../lib/sanitize.js';
import { ensureUniqueSlug, slugify } from '../lib/slugify.js';
import { resolveAuthor } from './authorship.js';
import { writeAuditLog } from './audit.js';
import { notifyUsersWithPermissionSafe } from './notifications.js';
const LIVE_STATUSES = new Set([
    'preparation',
    'scheduled',
    'live',
    'paused',
    'ended',
    'archived',
]);
const UPDATE_STATUSES = new Set(['draft', 'published', 'withdrawn']);
const liveAuthor = alias(users, 'live_author');
const displayAuthorName = sql `COALESCE(${liveAuthor.name}, NULLIF(${liveCoverages.authorName}, ''), 'Redacção')`;
const TRANSITIONS = {
    preparation: { schedule: 'scheduled', start: 'live', archive: 'archived' },
    scheduled: { schedule: 'scheduled', start: 'live', archive: 'archived' },
    live: { pause: 'paused', end: 'ended' },
    paused: { resume: 'live', end: 'ended' },
    ended: { archive: 'archived' },
    archived: {},
};
export const LIVE_ACTIONS = ['schedule', 'start', 'pause', 'resume', 'end', 'archive'];
export const LIVE_UPDATE_ACTIONS = ['publish', 'withdraw', 'submit'];
function requirePermission(user, permission) {
    if (!user.permissions.includes(permission))
        throw forbidden();
}
function affectedRows(result) {
    const header = Array.isArray(result) ? result[0] : result;
    return Number(header?.affectedRows ?? 0);
}
export function normalizeStreamEmbedUrl(raw) {
    const value = raw?.trim();
    if (!value)
        return null;
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw badRequest('INVALID_STREAM_URL', 'URL de transmissão inválido.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
        throw badRequest('INVALID_STREAM_URL', 'A transmissão deve usar um URL https de incorporação.');
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const videoId = /^[A-Za-z0-9_-]{11}$/;
    const channelId = /^[A-Za-z0-9_-]{10,40}$/;
    if (host === 'youtu.be') {
        const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
        if (!videoId.test(id))
            throw badRequest('INVALID_STREAM_URL', 'URL do YouTube inválido.');
        return { url: `https://www.youtube.com/embed/${id}`, provider: 'youtube' };
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
        const parts = url.pathname.split('/').filter(Boolean);
        let id;
        if (parts[0] === 'embed' && parts[1] === 'live_stream') {
            const channel = url.searchParams.get('channel') ?? '';
            if (!channelId.test(channel))
                throw badRequest('INVALID_STREAM_URL', 'Canal do YouTube inválido.');
            return {
                url: `https://www.youtube.com/embed/live_stream?channel=${channel}`,
                provider: 'youtube',
            };
        }
        if (parts[0] === 'embed' || parts[0] === 'live')
            id = parts[1];
        if (parts[0] === 'watch')
            id = url.searchParams.get('v') ?? undefined;
        if (!id || !videoId.test(id))
            throw badRequest('INVALID_STREAM_URL', 'URL do YouTube inválido.');
        return { url: `https://www.youtube.com/embed/${id}`, provider: 'youtube' };
    }
    if (host === 'player.vimeo.com') {
        const match = url.pathname.match(/^\/video\/(\d{5,15})\/?$/);
        if (!match)
            throw badRequest('INVALID_STREAM_URL', 'URL do Vimeo inválido.');
        return { url: `https://player.vimeo.com/video/${match[1]}`, provider: 'vimeo' };
    }
    if (host === 'vimeo.com') {
        const event = url.pathname.match(/^\/event\/(\d{5,15})(\/embed)?\/?$/);
        if (event)
            return { url: `https://vimeo.com/event/${event[1]}/embed`, provider: 'vimeo' };
        const video = url.pathname.match(/^\/(\d{5,15})\/?$/);
        if (video)
            return { url: `https://player.vimeo.com/video/${video[1]}`, provider: 'vimeo' };
        throw badRequest('INVALID_STREAM_URL', 'URL do Vimeo inválido.');
    }
    throw badRequest('INVALID_STREAM_URL', 'Apenas incorporações https do YouTube ou Vimeo são permitidas.');
}
function normalizeSourceUrl(raw) {
    const value = raw?.trim();
    if (!value)
        return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            throw new Error('protocol');
        return url.toString().slice(0, 500);
    }
    catch {
        throw badRequest('INVALID_SOURCE_URL', 'URL da fonte inválido.');
    }
}
function parseDate(value, code, message) {
    if (value == null)
        return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        throw badRequest(code, message);
    return date;
}
async function existingSlugs(excludeId) {
    const rows = await db.select({ id: liveCoverages.id, slug: liveCoverages.slug }).from(liveCoverages);
    return new Set(rows.filter((row) => row.id !== excludeId).map((row) => row.slug));
}
async function syncCoverUsage(coverageId, coverMediaId) {
    await db
        .delete(mediaUsages)
        .where(and(eq(mediaUsages.entityType, 'live_coverage'), eq(mediaUsages.entityId, coverageId), eq(mediaUsages.usageKind, 'cover')));
    if (coverMediaId) {
        await db.insert(mediaUsages).values({
            id: newId(),
            mediaId: coverMediaId,
            entityType: 'live_coverage',
            entityId: coverageId,
            usageKind: 'cover',
        });
    }
}
async function loadCoverage(id) {
    const [row] = await db
        .select()
        .from(liveCoverages)
        .where(and(eq(liveCoverages.id, id), isNull(liveCoverages.deletedAt)))
        .limit(1);
    if (!row)
        throw notFound('Cobertura em directo não encontrada.');
    return row;
}
function presentCoverage(row) {
    const authorUserId = 'authorUserId' in row ? row.authorUserId : undefined;
    return {
        ...row,
        ...(authorUserId !== undefined ? { authorId: authorUserId ?? '' } : {}),
        coverUrl: row.coverMediaId ? `/media/${row.coverMediaId}/original` : null,
        coverThumbUrl: row.coverMediaId ? `/media/${row.coverMediaId}/thumb` : null,
    };
}
function presentUpdate(row) {
    return {
        ...row,
        mediaUrl: row.mediaId ? `/media/${row.mediaId}/original` : null,
        mediaThumbUrl: row.mediaId ? `/media/${row.mediaId}/thumb` : null,
    };
}
export async function listCoverages(user, input) {
    requirePermission(user, PERMISSIONS.LIVE_READ);
    const filters = [isNull(liveCoverages.deletedAt)];
    if (input.status) {
        if (!LIVE_STATUSES.has(input.status)) {
            throw badRequest('INVALID_STATUS', 'Estado inválido.');
        }
        filters.push(eq(liveCoverages.status, input.status));
    }
    if (input.q?.trim()) {
        const q = `%${input.q.trim()}%`;
        filters.push(or(like(liveCoverages.title, q), like(liveCoverages.summary, q), like(liveCoverages.slug, q)));
    }
    const where = and(...filters);
    const [totalRow] = await db.select({ total: count() }).from(liveCoverages).where(where);
    const meta = paginateMeta(Number(totalRow.total), input.page, input.pageSize);
    const rows = await db
        .select({
        id: liveCoverages.id,
        slug: liveCoverages.slug,
        title: liveCoverages.title,
        summary: liveCoverages.summary,
        status: liveCoverages.status,
        featured: liveCoverages.featured,
        coverMediaId: liveCoverages.coverMediaId,
        streamProvider: liveCoverages.streamProvider,
        scheduledStartAt: liveCoverages.scheduledStartAt,
        startedAt: liveCoverages.startedAt,
        endedAt: liveCoverages.endedAt,
        lastUpdateAt: liveCoverages.lastUpdateAt,
        updatedAt: liveCoverages.updatedAt,
        version: liveCoverages.version,
        categoryName: categories.name,
        authorName: displayAuthorName,
        publishedUpdates: sql `(SELECT COUNT(*) FROM ${liveCoverageUpdates} WHERE ${liveCoverageUpdates.coverageId} = ${liveCoverages.id} AND ${liveCoverageUpdates.status} = 'published')`,
        draftUpdates: sql `(SELECT COUNT(*) FROM ${liveCoverageUpdates} WHERE ${liveCoverageUpdates.coverageId} = ${liveCoverages.id} AND ${liveCoverageUpdates.status} = 'draft')`,
    })
        .from(liveCoverages)
        .innerJoin(categories, eq(liveCoverages.categoryId, categories.id))
        .leftJoin(liveAuthor, eq(liveCoverages.authorUserId, liveAuthor.id))
        .where(where)
        .orderBy(desc(liveCoverages.updatedAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return {
        items: rows.map((row) => ({
            ...presentCoverage(row),
            publishedUpdates: Number(row.publishedUpdates),
            draftUpdates: Number(row.draftUpdates),
        })),
        ...meta,
    };
}
export async function getCoverage(user, id) {
    requirePermission(user, PERMISSIONS.LIVE_READ);
    const [row] = await db
        .select({
        coverage: liveCoverages,
        categoryName: categories.name,
        categorySlug: categories.slug,
        authorName: displayAuthorName,
    })
        .from(liveCoverages)
        .innerJoin(categories, eq(liveCoverages.categoryId, categories.id))
        .leftJoin(liveAuthor, eq(liveCoverages.authorUserId, liveAuthor.id))
        .where(and(eq(liveCoverages.id, id), isNull(liveCoverages.deletedAt)))
        .limit(1);
    if (!row)
        throw notFound('Cobertura em directo não encontrada.');
    const [counts] = await db
        .select({
        published: sql `COALESCE(SUM(CASE WHEN ${liveCoverageUpdates.status} = 'published' THEN 1 ELSE 0 END), 0)`,
        drafts: sql `COALESCE(SUM(CASE WHEN ${liveCoverageUpdates.status} = 'draft' THEN 1 ELSE 0 END), 0)`,
        withdrawn: sql `COALESCE(SUM(CASE WHEN ${liveCoverageUpdates.status} = 'withdrawn' THEN 1 ELSE 0 END), 0)`,
    })
        .from(liveCoverageUpdates)
        .where(eq(liveCoverageUpdates.coverageId, id));
    return {
        ...presentCoverage(row.coverage),
        categoryName: row.categoryName,
        categorySlug: row.categorySlug,
        authorName: row.authorName,
        updateCounts: {
            published: Number(counts?.published ?? 0),
            drafts: Number(counts?.drafts ?? 0),
            withdrawn: Number(counts?.withdrawn ?? 0),
        },
    };
}
async function assertCategory(categoryId) {
    const [category] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (!category)
        throw badRequest('INVALID_CATEGORY', 'Categoria inválida.');
}
export async function createCoverage(user, input) {
    requirePermission(user, PERMISSIONS.LIVE_MANAGE);
    await assertCategory(input.categoryId);
    const byline = await resolveAuthor({
        actor: user,
        requestedUserId: input.authorId,
        mode: 'create',
        permission: PERMISSIONS.LIVE_MANAGE,
    });
    const base = slugify(input.slug ?? input.title);
    if (!base)
        throw badRequest('INVALID_SLUG', 'O título gera um slug vazio.');
    if (isReservedSlug(base)) {
        throw badRequest('RESERVED_SLUG', 'Este título gera um slug reservado. Altere o título.');
    }
    const slug = ensureUniqueSlug(base, await existingSlugs(), new Date().getFullYear());
    const stream = normalizeStreamEmbedUrl(input.streamEmbedUrl);
    const scheduledStartAt = parseDate(input.scheduledStartAt, 'INVALID_SCHEDULE', 'Data de início inválida.');
    const id = newId();
    await db.insert(liveCoverages).values({
        id,
        slug,
        title: input.title.trim(),
        summary: input.summary.trim(),
        descriptionHtml: input.descriptionHtml ? sanitizeArticleHtml(input.descriptionHtml) : null,
        categoryId: input.categoryId,
        authorUserId: byline.authorUserId,
        authorName: byline.authorName,
        coverMediaId: input.coverMediaId ?? null,
        coverAlt: input.coverAlt ?? null,
        status: 'preparation',
        featured: input.featured ?? false,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        noindex: input.noindex ?? false,
        streamEmbedUrl: stream?.url ?? null,
        streamProvider: stream?.provider ?? null,
        scheduledStartAt,
        createdByUserId: user.id,
        updatedByUserId: user.id,
    });
    if (input.coverMediaId)
        await syncCoverUsage(id, input.coverMediaId);
    await writeAuditLog({
        actorUserId: user.id,
        action: 'live.create',
        entityType: 'live_coverage',
        entityId: id,
    });
    if (!user.permissions.includes(PERMISSIONS.LIVE_PUBLISH)) {
        await notifyUsersWithPermissionSafe({
            permission: PERMISSIONS.LIVE_PUBLISH,
            type: 'live.created',
            title: 'Nova cobertura em directo',
            body: `«${input.title.trim()}» foi criada por ${user.name}.`,
            entityType: 'live_coverage',
            entityId: id,
            excludeUserId: user.id,
            dedupeKey: `live:${id}:created`,
        });
    }
    return getCoverage(user, id);
}
export async function updateCoverage(user, id, input) {
    requirePermission(user, PERMISSIONS.LIVE_MANAGE);
    const current = await loadCoverage(id);
    if (current.version !== input.version) {
        throw conflict('VERSION_CONFLICT', 'A cobertura foi alterada por outra pessoa. Recarregue e tente novamente.');
    }
    if (current.status === 'archived') {
        throw badRequest('LIVE_ARCHIVED', 'Coberturas arquivadas não podem ser editadas.');
    }
    const categoryId = input.categoryId ?? current.categoryId;
    if (input.categoryId)
        await assertCategory(categoryId);
    const byline = input.authorId
        ? await resolveAuthor({
            actor: user,
            requestedUserId: input.authorId,
            currentUserId: current.authorUserId,
            currentName: current.authorName,
            mode: 'update',
            permission: PERMISSIONS.LIVE_MANAGE,
        })
        : { authorUserId: current.authorUserId, authorName: current.authorName };
    let slug = current.slug;
    if (input.slug !== undefined) {
        const candidate = slugify(input.slug);
        if (!candidate)
            throw badRequest('INVALID_SLUG', 'O slug não pode ficar vazio.');
        if (candidate !== current.slug) {
            if (current.status !== 'preparation' && current.status !== 'scheduled') {
                throw badRequest('SLUG_LOCKED', 'O slug só pode ser alterado antes do início da cobertura.');
            }
            if (isReservedSlug(candidate))
                throw badRequest('RESERVED_SLUG', 'Slug reservado.');
            if ((await existingSlugs(id)).has(candidate)) {
                throw conflict('SLUG_EXISTS', 'Já existe uma cobertura com este slug.');
            }
            slug = candidate;
        }
    }
    let streamEmbedUrl = current.streamEmbedUrl;
    let streamProvider = current.streamProvider;
    if (input.streamEmbedUrl !== undefined) {
        const stream = normalizeStreamEmbedUrl(input.streamEmbedUrl);
        streamEmbedUrl = stream?.url ?? null;
        streamProvider = stream?.provider ?? null;
    }
    const scheduledStartAt = input.scheduledStartAt === undefined
        ? current.scheduledStartAt
        : parseDate(input.scheduledStartAt, 'INVALID_SCHEDULE', 'Data de início inválida.');
    const result = await db
        .update(liveCoverages)
        .set({
        slug,
        title: input.title?.trim() ?? current.title,
        summary: input.summary?.trim() ?? current.summary,
        descriptionHtml: input.descriptionHtml === undefined
            ? current.descriptionHtml
            : input.descriptionHtml
                ? sanitizeArticleHtml(input.descriptionHtml)
                : null,
        categoryId,
        authorUserId: byline.authorUserId,
        authorName: byline.authorName,
        coverMediaId: input.coverMediaId === undefined ? current.coverMediaId : input.coverMediaId,
        coverAlt: input.coverAlt === undefined ? current.coverAlt : input.coverAlt,
        featured: input.featured ?? current.featured,
        seoTitle: input.seoTitle === undefined ? current.seoTitle : input.seoTitle,
        seoDescription: input.seoDescription === undefined ? current.seoDescription : input.seoDescription,
        noindex: input.noindex ?? current.noindex,
        streamEmbedUrl,
        streamProvider,
        scheduledStartAt,
        version: current.version + 1,
        updatedByUserId: user.id,
    })
        .where(and(eq(liveCoverages.id, id), eq(liveCoverages.version, current.version)));
    if (affectedRows(result) === 0) {
        throw conflict('VERSION_CONFLICT', 'A cobertura foi alterada por outra pessoa.');
    }
    if (input.coverMediaId !== undefined)
        await syncCoverUsage(id, input.coverMediaId);
    await writeAuditLog({
        actorUserId: user.id,
        action: 'live.update',
        entityType: 'live_coverage',
        entityId: id,
        meta: { version: current.version + 1 },
    });
    return getCoverage(user, id);
}
export async function transitionCoverage(user, id, action, opts) {
    requirePermission(user, PERMISSIONS.LIVE_PUBLISH);
    const current = await loadCoverage(id);
    if (opts?.version != null && opts.version !== current.version) {
        throw conflict('VERSION_CONFLICT', 'Versão desactualizada.');
    }
    const next = TRANSITIONS[current.status]?.[action];
    if (!next) {
        throw badRequest('INVALID_TRANSITION', `Acção «${action}» inválida no estado «${current.status}».`);
    }
    if (action === 'start' || action === 'schedule') {
        if (!current.title.trim() || !current.summary.trim()) {
            throw badRequest('LIVE_INCOMPLETE', 'Título e resumo são obrigatórios.');
        }
    }
    const now = new Date();
    let scheduledStartAt = current.scheduledStartAt;
    let startedAt = current.startedAt;
    let endedAt = current.endedAt;
    let streamStatus = current.streamStatus;
    if (action === 'schedule') {
        const when = parseDate(opts?.scheduledStartAt ?? current.scheduledStartAt, 'INVALID_SCHEDULE', 'Data de início inválida.');
        if (!when)
            throw badRequest('SCHEDULE_REQUIRED', 'Indique a data de início.');
        if (when.getTime() <= Date.now()) {
            throw badRequest('SCHEDULE_INVALID', 'A data de início deve ser futura.');
        }
        scheduledStartAt = when;
    }
    if (action === 'start') {
        startedAt = current.startedAt ?? now;
        endedAt = null;
    }
    if (action === 'end')
        endedAt = now;
    if (current.streamEmbedUrl) {
        if (next === 'live')
            streamStatus = 'live';
        if (next === 'paused')
            streamStatus = 'paused';
        if (next === 'ended')
            streamStatus = 'ended';
    }
    const bumpsActivity = ['start', 'pause', 'resume', 'end'].includes(action);
    const result = await db
        .update(liveCoverages)
        .set({
        status: next,
        scheduledStartAt,
        startedAt,
        endedAt,
        streamStatus,
        lastUpdateAt: bumpsActivity ? now : current.lastUpdateAt,
        version: current.version + 1,
        updatedByUserId: user.id,
    })
        .where(and(eq(liveCoverages.id, id), eq(liveCoverages.version, current.version)));
    if (affectedRows(result) === 0) {
        throw conflict('VERSION_CONFLICT', 'A cobertura foi alterada por outra pessoa.');
    }
    await writeAuditLog({
        actorUserId: user.id,
        action: `live.${action}`,
        entityType: 'live_coverage',
        entityId: id,
        meta: { from: current.status, to: next },
    });
    const notices = {
        start: 'Cobertura em directo iniciada',
        end: 'Cobertura em directo terminada',
        schedule: 'Cobertura em directo agendada',
    };
    if (notices[action]) {
        await notifyUsersWithPermissionSafe({
            permission: PERMISSIONS.LIVE_PUBLISH,
            type: `live.${action}`,
            title: notices[action],
            body: `«${current.title}»`,
            entityType: 'live_coverage',
            entityId: id,
            excludeUserId: user.id,
            dedupeKey: `live:${id}:${action}:${current.version + 1}`,
        });
    }
    return getCoverage(user, id);
}
export async function softDeleteCoverage(user, id) {
    requirePermission(user, PERMISSIONS.LIVE_MANAGE);
    const current = await loadCoverage(id);
    if (current.status === 'live' || current.status === 'paused') {
        throw badRequest('LIVE_ACTIVE', 'Termine a cobertura antes de a eliminar.');
    }
    await db
        .update(liveCoverages)
        .set({ deletedAt: new Date(), updatedByUserId: user.id, version: current.version + 1 })
        .where(eq(liveCoverages.id, id));
    await writeAuditLog({
        actorUserId: user.id,
        action: 'live.delete',
        entityType: 'live_coverage',
        entityId: id,
    });
    return { ok: true };
}
async function loadUpdate(coverageId, updateId) {
    const [row] = await db
        .select()
        .from(liveCoverageUpdates)
        .where(and(eq(liveCoverageUpdates.id, updateId), eq(liveCoverageUpdates.coverageId, coverageId)))
        .limit(1);
    if (!row)
        throw notFound('Actualização não encontrada.');
    return row;
}
async function touchCoverage(coverageId, at) {
    await db.update(liveCoverages).set({ lastUpdateAt: at }).where(eq(liveCoverages.id, coverageId));
}
export async function listUpdates(user, coverageId, input) {
    requirePermission(user, PERMISSIONS.LIVE_READ);
    await loadCoverage(coverageId);
    const filters = [eq(liveCoverageUpdates.coverageId, coverageId)];
    if (input.status) {
        if (!UPDATE_STATUSES.has(input.status)) {
            throw badRequest('INVALID_STATUS', 'Estado inválido.');
        }
        filters.push(eq(liveCoverageUpdates.status, input.status));
    }
    const where = and(...filters);
    const [totalRow] = await db.select({ total: count() }).from(liveCoverageUpdates).where(where);
    const meta = paginateMeta(Number(totalRow.total), input.page, input.pageSize);
    const rows = await db
        .select()
        .from(liveCoverageUpdates)
        .where(where)
        .orderBy(desc(liveCoverageUpdates.eventAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return { items: rows.map(presentUpdate), ...meta };
}
export async function getUpdate(user, coverageId, updateId) {
    requirePermission(user, PERMISSIONS.LIVE_READ);
    await loadCoverage(coverageId);
    return presentUpdate(await loadUpdate(coverageId, updateId));
}
function assertBody(html) {
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    if (!plain && !/<img\b/i.test(html)) {
        throw badRequest('BODY_REQUIRED', 'O texto da actualização está vazio.');
    }
}
export async function createUpdate(user, coverageId, input) {
    requirePermission(user, PERMISSIONS.LIVE_MANAGE);
    const coverage = await loadCoverage(coverageId);
    if (coverage.status === 'archived') {
        throw badRequest('LIVE_ARCHIVED', 'Coberturas arquivadas não aceitam actualizações.');
    }
    if (input.publish)
        requirePermission(user, PERMISSIONS.LIVE_PUBLISH);
    const bodyHtml = sanitizeArticleHtml(input.bodyHtml);
    assertBody(bodyHtml);
    const eventAt = parseDate(input.eventAt, 'INVALID_EVENT_AT', 'Data do evento inválida.') ?? new Date();
    const now = new Date();
    const id = newId();
    await db.insert(liveCoverageUpdates).values({
        id,
        coverageId,
        title: input.title?.trim() || null,
        bodyHtml,
        bodyJson: input.bodyJson ?? null,
        eventAt,
        isImportant: input.isImportant ?? false,
        status: input.publish ? 'published' : 'draft',
        authorUserId: user.id,
        sourceUrl: normalizeSourceUrl(input.sourceUrl),
        mediaId: input.mediaId ?? null,
        mediaCaption: input.mediaCaption ?? null,
        publishedAt: input.publish ? now : null,
    });
    if (input.publish)
        await touchCoverage(coverageId, now);
    await writeAuditLog({
        actorUserId: user.id,
        action: input.publish ? 'live.update.publish' : 'live.update.create',
        entityType: 'live_coverage_update',
        entityId: id,
        meta: { coverageId },
    });
    return presentUpdate(await loadUpdate(coverageId, id));
}
export async function editUpdate(user, coverageId, updateId, input) {
    requirePermission(user, PERMISSIONS.LIVE_MANAGE);
    await loadCoverage(coverageId);
    const current = await loadUpdate(coverageId, updateId);
    if (current.version !== input.version) {
        throw conflict('VERSION_CONFLICT', 'A actualização foi alterada por outra pessoa. Recarregue e tente novamente.');
    }
    if (current.status === 'published')
        requirePermission(user, PERMISSIONS.LIVE_PUBLISH);
    let bodyHtml = current.bodyHtml;
    if (input.bodyHtml !== undefined) {
        bodyHtml = sanitizeArticleHtml(input.bodyHtml);
        assertBody(bodyHtml);
    }
    const result = await db
        .update(liveCoverageUpdates)
        .set({
        title: input.title === undefined ? current.title : input.title?.trim() || null,
        bodyHtml,
        bodyJson: input.bodyJson === undefined ? current.bodyJson : input.bodyJson,
        eventAt: input.eventAt === undefined
            ? current.eventAt
            : (parseDate(input.eventAt, 'INVALID_EVENT_AT', 'Data do evento inválida.') ??
                current.eventAt),
        isImportant: input.isImportant ?? current.isImportant,
        sourceUrl: input.sourceUrl === undefined ? current.sourceUrl : normalizeSourceUrl(input.sourceUrl),
        mediaId: input.mediaId === undefined ? current.mediaId : input.mediaId,
        mediaCaption: input.mediaCaption === undefined ? current.mediaCaption : input.mediaCaption,
        version: current.version + 1,
    })
        .where(and(eq(liveCoverageUpdates.id, updateId), eq(liveCoverageUpdates.version, current.version)));
    if (affectedRows(result) === 0) {
        throw conflict('VERSION_CONFLICT', 'A actualização foi alterada por outra pessoa.');
    }
    if (current.status === 'published')
        await touchCoverage(coverageId, new Date());
    await writeAuditLog({
        actorUserId: user.id,
        action: 'live.update.edit',
        entityType: 'live_coverage_update',
        entityId: updateId,
        meta: { coverageId, version: current.version + 1 },
    });
    return presentUpdate(await loadUpdate(coverageId, updateId));
}
export async function transitionUpdate(user, coverageId, updateId, action, opts) {
    const coverage = await loadCoverage(coverageId);
    const current = await loadUpdate(coverageId, updateId);
    if (opts?.version != null && opts.version !== current.version) {
        throw conflict('VERSION_CONFLICT', 'Versão desactualizada.');
    }
    if (action === 'submit') {
        requirePermission(user, PERMISSIONS.LIVE_MANAGE);
        if (current.status !== 'draft') {
            throw badRequest('INVALID_TRANSITION', 'Apenas rascunhos podem ser submetidos.');
        }
        await notifyUsersWithPermissionSafe({
            permission: PERMISSIONS.LIVE_PUBLISH,
            type: 'live.update.submitted',
            title: 'Actualização de directo aguarda publicação',
            body: `«${coverage.title}»${current.title ? ` — ${current.title}` : ''}`,
            entityType: 'live_coverage_update',
            entityId: updateId,
            excludeUserId: user.id,
            dedupeKey: `live-update:${updateId}:submit:${current.version}`,
        });
        await writeAuditLog({
            actorUserId: user.id,
            action: 'live.update.submit',
            entityType: 'live_coverage_update',
            entityId: updateId,
            meta: { coverageId },
        });
        return presentUpdate(current);
    }
    requirePermission(user, PERMISSIONS.LIVE_PUBLISH);
    const now = new Date();
    if (action === 'publish') {
        if (current.status === 'published') {
            throw badRequest('INVALID_TRANSITION', 'A actualização já está publicada.');
        }
        if (coverage.status === 'archived') {
            throw badRequest('LIVE_ARCHIVED', 'Coberturas arquivadas não aceitam actualizações.');
        }
        assertBody(current.bodyHtml);
        await db
            .update(liveCoverageUpdates)
            .set({ status: 'published', publishedAt: now, withdrawnAt: null, version: current.version + 1 })
            .where(eq(liveCoverageUpdates.id, updateId));
        await touchCoverage(coverageId, now);
    }
    else if (action === 'withdraw') {
        if (current.status !== 'published') {
            throw badRequest('INVALID_TRANSITION', 'Apenas actualizações publicadas podem ser retiradas.');
        }
        await db
            .update(liveCoverageUpdates)
            .set({ status: 'withdrawn', withdrawnAt: now, version: current.version + 1 })
            .where(eq(liveCoverageUpdates.id, updateId));
        await touchCoverage(coverageId, now);
    }
    else {
        throw badRequest('INVALID_TRANSITION', `Acção «${action}» inválida.`);
    }
    await writeAuditLog({
        actorUserId: user.id,
        action: `live.update.${action}`,
        entityType: 'live_coverage_update',
        entityId: updateId,
        meta: { coverageId, from: current.status },
    });
    return presentUpdate(await loadUpdate(coverageId, updateId));
}
export async function deleteUpdate(user, coverageId, updateId) {
    requirePermission(user, PERMISSIONS.LIVE_MANAGE);
    await loadCoverage(coverageId);
    const current = await loadUpdate(coverageId, updateId);
    if (current.status === 'published') {
        throw badRequest('UPDATE_PUBLISHED', 'Retire a actualização publicada antes de a eliminar.');
    }
    await db.delete(liveCoverageUpdates).where(eq(liveCoverageUpdates.id, updateId));
    await writeAuditLog({
        actorUserId: user.id,
        action: 'live.update.delete',
        entityType: 'live_coverage_update',
        entityId: updateId,
        meta: { coverageId },
    });
    return { ok: true };
}
export async function countActiveCoverages() {
    const [row] = await db
        .select({ total: count() })
        .from(liveCoverages)
        .where(and(isNull(liveCoverages.deletedAt), eq(liveCoverages.status, 'live')));
    return Number(row?.total ?? 0);
}
