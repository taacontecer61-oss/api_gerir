import { and, count, desc, eq, like, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { categories, videos } from '../db/schema/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAll, requireAny, requireEditorialWrite } from '../lib/guards.js';
import { newId } from '../lib/ids.js';
import { paginateMeta } from '../lib/pagination.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { ensureUniqueSlug, slugify } from '../lib/slugify.js';
import { writeAuditLog } from './audit.js';
import { clearMediaUsages, mediaIdFromUrl, replaceMediaUsage } from './media-usage.js';
const DURATION_PATTERN = /^\d{1,2}(:\d{2}){1,2}$/;
function likePattern(q) {
    return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
function requireRead(user) {
    requireAny(user, PERMISSIONS.ARTICLES_READ, PERMISSIONS.MEDIA_UPLOAD);
}
function requireWrite(user) {
    requireAll(user, PERMISSIONS.MEDIA_UPLOAD);
}
const videoColumns = {
    id: videos.id,
    slug: videos.slug,
    title: videos.title,
    description: videos.description,
    categoryId: videos.categoryId,
    categoryName: categories.name,
    categorySlug: categories.slug,
    duration: videos.duration,
    thumbnailUrl: videos.thumbnailUrl,
    sourceUrl: videos.sourceUrl,
    publishedAt: videos.publishedAt,
    isPublished: videos.isPublished,
    createdAt: videos.createdAt,
    updatedAt: videos.updatedAt,
};
export async function listVideos(user, input) {
    requireRead(user);
    const filters = [];
    if (input.isPublished !== undefined)
        filters.push(eq(videos.isPublished, input.isPublished));
    if (input.categoryId)
        filters.push(eq(videos.categoryId, input.categoryId));
    if (input.q?.trim()) {
        const pattern = likePattern(input.q.trim());
        filters.push(or(like(videos.title, pattern), like(videos.slug, pattern)));
    }
    const where = filters.length ? and(...filters) : undefined;
    const [totalRow] = await db.select({ total: count() }).from(videos).where(where);
    const meta = paginateMeta(Number(totalRow.total), input.page, input.pageSize);
    const items = await db
        .select(videoColumns)
        .from(videos)
        .innerJoin(categories, eq(videos.categoryId, categories.id))
        .where(where)
        .orderBy(desc(videos.publishedAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return { items, ...meta };
}
export async function getVideo(user, id) {
    requireRead(user);
    return loadVideo(id);
}
async function loadVideo(id) {
    const [row] = await db
        .select(videoColumns)
        .from(videos)
        .innerJoin(categories, eq(videos.categoryId, categories.id))
        .where(eq(videos.id, id))
        .limit(1);
    if (!row)
        throw notFound('Vídeo não encontrado.');
    return row;
}
async function existingSlugs(excludeId) {
    const rows = await db.select({ id: videos.id, slug: videos.slug }).from(videos);
    return new Set(rows.filter((row) => row.id !== excludeId).map((row) => row.slug));
}
async function assertCategory(categoryId) {
    const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);
    if (!category)
        throw badRequest('INVALID_CATEGORY', 'Categoria inválida.');
}
function parseDate(value, fallback) {
    if (value === undefined)
        return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        throw badRequest('INVALID_DATE', 'Data de publicação inválida.');
    return date;
}
function assertDuration(duration) {
    if (!DURATION_PATTERN.test(duration)) {
        throw badRequest('INVALID_DURATION', 'Duração inválida. Use o formato mm:ss ou hh:mm:ss.');
    }
}
export async function createVideo(user, input) {
    requireWrite(user);
    if (input.isPublished)
        requireEditorialWrite(user);
    const title = input.title.trim();
    if (title.length < 3)
        throw badRequest('INVALID_TITLE', 'O título é obrigatório.');
    assertDuration(input.duration);
    await assertCategory(input.categoryId);
    const base = slugify(input.slug?.trim() || title);
    if (!base)
        throw badRequest('INVALID_SLUG', 'Slug inválido.');
    const taken = await existingSlugs();
    if (input.slug && taken.has(base))
        throw conflict('SLUG_EXISTS', 'Já existe um vídeo com este slug.');
    const slug = ensureUniqueSlug(base, taken, new Date().getFullYear());
    const id = newId();
    await db.transaction(async (tx) => {
        await tx.insert(videos).values({
            id,
            slug,
            title,
            description: input.description.trim(),
            categoryId: input.categoryId,
            duration: input.duration,
            thumbnailUrl: input.thumbnailUrl,
            sourceUrl: input.sourceUrl?.trim() || null,
            publishedAt: parseDate(input.publishedAt, new Date()),
            isPublished: input.isPublished ?? false,
        });
        await replaceMediaUsage(tx, 'video', id, 'thumbnail', [mediaIdFromUrl(input.thumbnailUrl)]);
    });
    await writeAuditLog({
        actorUserId: user.id,
        action: 'video.create',
        entityType: 'video',
        entityId: id,
    });
    return loadVideo(id);
}
export async function updateVideo(user, id, input) {
    requireWrite(user);
    const current = await loadVideo(id);
    const nextPublished = input.isPublished ?? current.isPublished;
    if (nextPublished || (input.isPublished !== undefined && input.isPublished !== current.isPublished)) {
        requireEditorialWrite(user);
    }
    if (input.title !== undefined && input.title.trim().length < 3) {
        throw badRequest('INVALID_TITLE', 'O título é obrigatório.');
    }
    if (input.duration !== undefined)
        assertDuration(input.duration);
    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
        await assertCategory(input.categoryId);
    }
    let slug = current.slug;
    if (input.slug !== undefined) {
        const candidate = slugify(input.slug);
        if (!candidate)
            throw badRequest('INVALID_SLUG', 'Slug inválido.');
        if (candidate !== current.slug) {
            if ((await existingSlugs(id)).has(candidate)) {
                throw conflict('SLUG_EXISTS', 'Já existe um vídeo com este slug.');
            }
            slug = candidate;
        }
    }
    const thumbnailUrl = input.thumbnailUrl ?? current.thumbnailUrl;
    await db.transaction(async (tx) => {
        await tx
            .update(videos)
            .set({
            slug,
            title: input.title?.trim() ?? current.title,
            description: input.description?.trim() ?? current.description,
            categoryId: input.categoryId ?? current.categoryId,
            duration: input.duration ?? current.duration,
            thumbnailUrl,
            sourceUrl: input.sourceUrl === undefined ? current.sourceUrl : input.sourceUrl?.trim() || null,
            publishedAt: parseDate(input.publishedAt, current.publishedAt),
            isPublished: input.isPublished ?? current.isPublished,
        })
            .where(eq(videos.id, id));
        if (input.thumbnailUrl !== undefined) {
            await replaceMediaUsage(tx, 'video', id, 'thumbnail', [mediaIdFromUrl(thumbnailUrl)]);
        }
    });
    await writeAuditLog({
        actorUserId: user.id,
        action: input.isPublished !== undefined && input.isPublished !== current.isPublished
            ? input.isPublished
                ? 'video.publish'
                : 'video.unpublish'
            : 'video.update',
        entityType: 'video',
        entityId: id,
    });
    return loadVideo(id);
}
export async function setVideoPublished(user, id, isPublished) {
    return updateVideo(user, id, { isPublished });
}
export async function deleteVideo(user, id) {
    requireEditorialWrite(user);
    await loadVideo(id);
    await db.transaction(async (tx) => {
        await tx.delete(videos).where(eq(videos.id, id));
        await clearMediaUsages(tx, 'video', id);
    });
    await writeAuditLog({
        actorUserId: user.id,
        action: 'video.delete',
        entityType: 'video',
        entityId: id,
    });
    return { ok: true };
}
