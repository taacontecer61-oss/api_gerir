import { and, asc, count, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { galleries, galleryPhotos } from '../db/schema/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAll, requireAny, requireEditorialWrite } from '../lib/guards.js';
import { newId } from '../lib/ids.js';
import { paginateMeta } from '../lib/pagination.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { ensureUniqueSlug, slugify } from '../lib/slugify.js';
import { writeAuditLog } from './audit.js';
import { assertMediaExists, clearMediaUsages, mediaIdFromUrl, replaceMediaUsage, } from './media-usage.js';
const MAX_PHOTOS = 200;
function likePattern(q) {
    return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
function requireRead(user) {
    requireAny(user, PERMISSIONS.ARTICLES_READ, PERMISSIONS.MEDIA_UPLOAD);
}
function requireWrite(user) {
    requireAll(user, PERMISSIONS.MEDIA_UPLOAD);
}
function presentPhoto(photo) {
    return {
        id: photo.id,
        mediaId: photo.mediaId,
        src: photo.mediaId ? `/media/${photo.mediaId}/original` : photo.src,
        thumbSrc: photo.mediaId ? `/media/${photo.mediaId}/thumb` : photo.src,
        alt: photo.alt,
        caption: photo.caption,
        sortOrder: photo.sortOrder,
    };
}
export async function listGalleries(user, input) {
    requireRead(user);
    const filters = [];
    if (input.isPublished !== undefined)
        filters.push(eq(galleries.isPublished, input.isPublished));
    if (input.q?.trim()) {
        const pattern = likePattern(input.q.trim());
        filters.push(or(like(galleries.title, pattern), like(galleries.slug, pattern)));
    }
    const where = filters.length ? and(...filters) : undefined;
    const [totalRow] = await db.select({ total: count() }).from(galleries).where(where);
    const meta = paginateMeta(Number(totalRow.total), input.page, input.pageSize);
    const items = await db
        .select({
        id: galleries.id,
        slug: galleries.slug,
        title: galleries.title,
        description: galleries.description,
        coverUrl: galleries.coverUrl,
        publishedAt: galleries.publishedAt,
        isPublished: galleries.isPublished,
        createdAt: galleries.createdAt,
        updatedAt: galleries.updatedAt,
        photoCount: sql `(SELECT COUNT(*) FROM ${galleryPhotos} WHERE ${galleryPhotos.galleryId} = ${galleries.id})`,
    })
        .from(galleries)
        .where(where)
        .orderBy(desc(galleries.publishedAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return { items: items.map((item) => ({ ...item, photoCount: Number(item.photoCount) })), ...meta };
}
export async function getGallery(user, id) {
    requireRead(user);
    return loadGallery(id);
}
async function loadGallery(id) {
    const [gallery] = await db.select().from(galleries).where(eq(galleries.id, id)).limit(1);
    if (!gallery)
        throw notFound('Galeria não encontrada.');
    const photos = await db
        .select()
        .from(galleryPhotos)
        .where(eq(galleryPhotos.galleryId, id))
        .orderBy(asc(galleryPhotos.sortOrder));
    return { ...gallery, photos: photos.map(presentPhoto) };
}
async function existingSlugs(excludeId) {
    const rows = await db.select({ id: galleries.id, slug: galleries.slug }).from(galleries);
    return new Set(rows.filter((row) => row.id !== excludeId).map((row) => row.slug));
}
function parseDate(value, fallback) {
    if (value === undefined)
        return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        throw badRequest('INVALID_DATE', 'Data de publicação inválida.');
    return date;
}
async function syncPhotos(tx, galleryId, photos, coverUrl) {
    if (photos.length > MAX_PHOTOS) {
        throw badRequest('TOO_MANY_PHOTOS', `Máximo de ${MAX_PHOTOS} fotografias por galeria.`);
    }
    const rows = photos.map((photo, index) => {
        const mediaId = photo.mediaId ?? mediaIdFromUrl(photo.src);
        const src = mediaId ? `/media/${mediaId}/original` : photo.src;
        if (!src) {
            throw badRequest('INVALID_PHOTO', 'Cada fotografia precisa de um ficheiro ou URL.');
        }
        const alt = photo.alt.trim();
        if (!alt)
            throw badRequest('ALT_REQUIRED', 'O texto alternativo de cada fotografia é obrigatório.');
        return {
            id: newId(),
            galleryId,
            mediaId,
            src,
            alt,
            caption: photo.caption?.trim() || null,
            sortOrder: photo.sortOrder ?? index,
        };
    });
    const mediaIds = rows.map((row) => row.mediaId).filter((id) => Boolean(id));
    await assertMediaExists(tx, mediaIds);
    await tx.delete(galleryPhotos).where(eq(galleryPhotos.galleryId, galleryId));
    if (rows.length)
        await tx.insert(galleryPhotos).values(rows);
    await replaceMediaUsage(tx, 'gallery', galleryId, 'photo', mediaIds);
    await replaceMediaUsage(tx, 'gallery', galleryId, 'cover', [mediaIdFromUrl(coverUrl)]);
}
export async function createGallery(user, input) {
    requireWrite(user);
    if (input.isPublished)
        requireEditorialWrite(user);
    const title = input.title.trim();
    if (title.length < 3)
        throw badRequest('INVALID_TITLE', 'O título é obrigatório.');
    const firstPhoto = input.photos?.[0];
    const derivedCover = input.coverMediaId
        ? `/media/${input.coverMediaId}/original`
        : (input.coverUrl ??
            (firstPhoto?.mediaId ? `/media/${firstPhoto.mediaId}/original` : firstPhoto?.src) ??
            '');
    if (!derivedCover) {
        throw badRequest('COVER_REQUIRED', 'Indique a capa da galeria (coverUrl, coverMediaId ou fotografias).');
    }
    const base = slugify(input.slug?.trim() || title);
    if (!base)
        throw badRequest('INVALID_SLUG', 'Slug inválido.');
    const taken = await existingSlugs();
    if (input.slug && taken.has(base))
        throw conflict('SLUG_EXISTS', 'Já existe uma galeria com este slug.');
    const slug = ensureUniqueSlug(base, taken, new Date().getFullYear());
    const id = newId();
    await db.transaction(async (tx) => {
        if (input.coverMediaId)
            await assertMediaExists(tx, [input.coverMediaId]);
        await tx.insert(galleries).values({
            id,
            slug,
            title,
            description: input.description.trim(),
            coverUrl: derivedCover,
            publishedAt: parseDate(input.publishedAt, new Date()),
            isPublished: input.isPublished ?? false,
        });
        await syncPhotos(tx, id, input.photos ?? [], derivedCover);
    });
    await writeAuditLog({
        actorUserId: user.id,
        action: 'gallery.create',
        entityType: 'gallery',
        entityId: id,
    });
    return loadGallery(id);
}
export async function updateGallery(user, id, input) {
    requireWrite(user);
    const current = await loadGallery(id);
    const nextPublished = input.isPublished ?? current.isPublished;
    if (nextPublished || (input.isPublished !== undefined && input.isPublished !== current.isPublished)) {
        requireEditorialWrite(user);
    }
    if (input.title !== undefined && input.title.trim().length < 3) {
        throw badRequest('INVALID_TITLE', 'O título é obrigatório.');
    }
    let slug = current.slug;
    if (input.slug !== undefined) {
        const candidate = slugify(input.slug);
        if (!candidate)
            throw badRequest('INVALID_SLUG', 'Slug inválido.');
        if (candidate !== current.slug) {
            if ((await existingSlugs(id)).has(candidate)) {
                throw conflict('SLUG_EXISTS', 'Já existe uma galeria com este slug.');
            }
            slug = candidate;
        }
    }
    const coverUrl = input.coverMediaId
        ? `/media/${input.coverMediaId}/original`
        : (input.coverUrl ?? current.coverUrl);
    await db.transaction(async (tx) => {
        if (input.coverMediaId)
            await assertMediaExists(tx, [input.coverMediaId]);
        await tx
            .update(galleries)
            .set({
            slug,
            title: input.title?.trim() ?? current.title,
            description: input.description?.trim() ?? current.description,
            coverUrl,
            publishedAt: parseDate(input.publishedAt, current.publishedAt),
            isPublished: input.isPublished ?? current.isPublished,
        })
            .where(eq(galleries.id, id));
        if (input.photos !== undefined) {
            await syncPhotos(tx, id, input.photos, coverUrl);
        }
        else if (coverUrl !== current.coverUrl) {
            await replaceMediaUsage(tx, 'gallery', id, 'cover', [mediaIdFromUrl(coverUrl)]);
        }
    });
    await writeAuditLog({
        actorUserId: user.id,
        action: input.isPublished !== undefined && input.isPublished !== current.isPublished
            ? input.isPublished
                ? 'gallery.publish'
                : 'gallery.unpublish'
            : 'gallery.update',
        entityType: 'gallery',
        entityId: id,
    });
    return loadGallery(id);
}
export async function setGalleryPublished(user, id, isPublished) {
    return updateGallery(user, id, { isPublished });
}
export async function deleteGallery(user, id) {
    requireEditorialWrite(user);
    await loadGallery(id);
    await db.transaction(async (tx) => {
        await tx.delete(galleryPhotos).where(eq(galleryPhotos.galleryId, id));
        await tx.delete(galleries).where(eq(galleries.id, id));
        await clearMediaUsages(tx, 'gallery', id);
    });
    await writeAuditLog({
        actorUserId: user.id,
        action: 'gallery.delete',
        entityType: 'gallery',
        entityId: id,
    });
    return { ok: true };
}
