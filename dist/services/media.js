import { access, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { and, count, desc, eq, like, notInArray, or } from 'drizzle-orm';
import sharp from 'sharp';
import { env } from '../config.js';
import { db } from '../db/index.js';
import { mediaAssets, mediaUsages } from '../db/schema/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { extensionForFormat, inspectImage, ImageReject, MAX_IMAGE_PIXELS } from '../lib/image-file.js';
import { newId } from '../lib/ids.js';
import { paginateMeta } from '../lib/pagination.js';
import { enqueue } from '../lib/jobs.js';
import { writeAuditLog } from './audit.js';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 8 * 1024 * 1024;
const DERIVATIVES = {
    thumb: { width: 400, quality: 75 },
    card: { width: 960, quality: 78 },
    hero: { width: 1600, quality: 80 },
};
const derivativeJobs = new Map();
function derivativePath(id, variant) {
    return join(env.mediaRoot, `${id.slice(0, 2)}/${id}-${variant}.webp`);
}
async function readUpload(file) {
    const chunks = [];
    for await (const chunk of file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const size = chunks.reduce((acc, c) => acc + c.length, 0);
        if (size > MAX_BYTES) {
            throw badRequest('FILE_TOO_LARGE', 'O ficheiro excede o limite de 8 MB.');
        }
    }
    return Buffer.concat(chunks);
}
export async function ensureMediaRoot() {
    await mkdir(env.mediaRoot, { recursive: true });
}
export async function listMedia(input) {
    const filters = [];
    if (input.unused) {
        filters.push(notInArray(mediaAssets.id, db.select({ id: mediaUsages.mediaId }).from(mediaUsages)));
    }
    if (input.q?.trim()) {
        const q = `%${input.q.trim()}%`;
        filters.push(or(like(mediaAssets.originalName, q), like(mediaAssets.altText, q), like(mediaAssets.caption, q)));
    }
    const where = filters.length ? and(...filters) : undefined;
    const [totalRow] = await db.select({ total: count() }).from(mediaAssets).where(where);
    const meta = paginateMeta(Number(totalRow.total), input.page, input.pageSize);
    const items = await db
        .select()
        .from(mediaAssets)
        .where(where)
        .orderBy(desc(mediaAssets.createdAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return {
        items: items.map((item) => ({
            ...item,
            url: `/media/${item.id}/original`,
            thumbUrl: `/media/${item.id}/thumb`,
            cardUrl: `/media/${item.id}/card`,
            heroUrl: `/media/${item.id}/hero`,
        })),
        ...meta,
    };
}
export async function getMedia(id) {
    const [item] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
    if (!item)
        throw notFound('Ficheiro não encontrado.');
    return {
        ...item,
        url: `/media/${item.id}/original`,
        thumbUrl: `/media/${item.id}/thumb`,
        cardUrl: `/media/${item.id}/card`,
        heroUrl: `/media/${item.id}/hero`,
    };
}
export async function saveUploadedMedia(input) {
    if (!ALLOWED_MIME.has(input.mimetype)) {
        throw badRequest('INVALID_FILE_TYPE', 'Apenas JPEG, PNG, WebP e GIF são permitidos.');
    }
    await ensureMediaRoot();
    const buffer = await readUpload(input.file);
    let inspected;
    try {
        inspected = await inspectImage(buffer);
    }
    catch (error) {
        if (error instanceof ImageReject && error.code === 'IMAGE_DIMENSIONS') {
            throw badRequest('IMAGE_DIMENSIONS', 'A imagem excede as dimensões permitidas.');
        }
        throw badRequest('INVALID_FILE_TYPE', 'O ficheiro não é uma imagem JPEG, PNG, WebP ou GIF válida.');
    }
    const id = newId();
    const relativeKey = `${id.slice(0, 2)}/${id}${extensionForFormat(inspected.format)}`;
    const absolute = join(env.mediaRoot, relativeKey);
    await mkdir(dirname(absolute), { recursive: true });
    const written = [];
    let sizeBytes = buffer.length;
    try {
        const base = sharp(buffer, {
            limitInputPixels: MAX_IMAGE_PIXELS,
            failOn: 'error',
            animated: false,
        }).rotate();
        const stored = await base.clone().toFile(absolute);
        written.push(absolute);
        sizeBytes = stored.size;
    }
    catch {
        await Promise.all(written.map((path) => unlink(path).catch(() => undefined)));
        throw badRequest('INVALID_FILE_TYPE', 'Não foi possível processar a imagem.');
    }
    await db.insert(mediaAssets).values({
        id,
        originalName: input.filename.slice(0, 255),
        mimeType: inspected.mime,
        sizeBytes,
        width: inspected.width,
        height: inspected.height,
        storageKey: relativeKey,
        altText: input.altText ?? null,
        caption: input.caption ?? null,
        credit: input.credit ?? null,
        uploadedByUserId: input.uploadedByUserId,
    }).catch(async (error) => {
        await Promise.all(written.map((path) => unlink(path).catch(() => undefined)));
        throw error;
    });
    await writeAuditLog({
        actorUserId: input.uploadedByUserId,
        action: 'media.upload',
        entityType: 'media',
        entityId: id,
    });
    enqueue(async () => {
        for (const variant of Object.keys(DERIVATIVES)) {
            await ensureDerivative(relativeKey, id, variant);
        }
    });
    return getMedia(id);
}
export async function updateMediaMeta(id, input, actorUserId) {
    await getMedia(id);
    const patch = {};
    if (input.altText !== undefined)
        patch.altText = input.altText;
    if (input.caption !== undefined)
        patch.caption = input.caption;
    if (input.credit !== undefined)
        patch.credit = input.credit;
    if (Object.keys(patch).length > 0) {
        await db.update(mediaAssets).set(patch).where(eq(mediaAssets.id, id));
    }
    await writeAuditLog({
        actorUserId,
        action: 'media.update',
        entityType: 'media',
        entityId: id,
    });
    return getMedia(id);
}
export async function deleteMedia(id, actorUserId) {
    const item = await getMedia(id);
    const [usage] = await db
        .select({ total: count() })
        .from(mediaUsages)
        .where(eq(mediaUsages.mediaId, id));
    if (Number(usage.total) > 0) {
        throw conflict('MEDIA_IN_USE', 'Este ficheiro está a ser utilizado e não pode ser eliminado.');
    }
    const absolute = join(env.mediaRoot, item.storageKey);
    await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
    await unlink(absolute).catch(() => undefined);
    await Promise.all(Object.keys(DERIVATIVES).map((variant) => unlink(derivativePath(item.id, variant)).catch(() => undefined)));
    await writeAuditLog({
        actorUserId,
        action: 'media.delete',
        entityType: 'media',
        entityId: id,
    });
    return { ok: true };
}
async function ensureDerivative(storageKey, id, variant) {
    const dest = derivativePath(id, variant);
    try {
        await access(dest);
        return dest;
    }
    catch {
        // Gerada no primeiro pedido para ficheiros anteriores a estas variantes.
    }
    const pending = derivativeJobs.get(dest);
    if (pending)
        return pending;
    const spec = DERIVATIVES[variant];
    const job = (async () => {
        const tmp = `${dest}.${process.pid}.part`;
        try {
            await mkdir(dirname(dest), { recursive: true });
            await sharp(join(env.mediaRoot, storageKey), {
                limitInputPixels: MAX_IMAGE_PIXELS,
                failOn: 'error',
                animated: false,
            })
                .rotate()
                .resize({ width: spec.width, withoutEnlargement: true })
                .webp({ quality: spec.quality, effort: 4 })
                .toFile(tmp);
            await rename(tmp, dest);
            return dest;
        }
        catch (error) {
            await unlink(tmp).catch(() => undefined);
            throw error;
        }
    })().finally(() => {
        derivativeJobs.delete(dest);
    });
    derivativeJobs.set(dest, job);
    return job;
}
export async function resolveMediaFile(id, variant) {
    const [item] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
    if (!item)
        throw notFound('Ficheiro não encontrado.');
    if (variant === 'original') {
        return {
            path: join(env.mediaRoot, item.storageKey),
            mimeType: item.mimeType,
            downloadName: item.originalName,
        };
    }
    try {
        const path = await ensureDerivative(item.storageKey, item.id, variant);
        return {
            path,
            mimeType: 'image/webp',
            downloadName: `${item.id}-${variant}.webp`,
        };
    }
    catch {
        throw notFound('Ficheiro não encontrado.');
    }
}
