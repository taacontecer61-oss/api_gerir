import { and, eq, inArray } from 'drizzle-orm';
import { mediaAssets, mediaUsages } from '../db/schema/index.js';
import { badRequest } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
const MEDIA_URL_PATTERN = /^\/media\/([0-9a-fA-F-]{36})\/(?:original|thumb)$/;
/** Extrai o id de media de um URL interno `/media/:id/original|thumb`. */
export function mediaIdFromUrl(url) {
    if (!url)
        return null;
    return MEDIA_URL_PATTERN.exec(url)?.[1] ?? null;
}
/** Garante que todos os ids existem em media_assets. */
export async function assertMediaExists(tx, mediaIds) {
    const unique = [...new Set(mediaIds)];
    if (!unique.length)
        return;
    const rows = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, unique));
    if (rows.length !== unique.length) {
        throw badRequest('INVALID_MEDIA', 'Um ou mais ficheiros multimédia não existem.');
    }
}
/** Substitui as utilizações de um (entidade, tipo de uso) pelos media ids indicados. */
export async function replaceMediaUsage(tx, entityType, entityId, usageKind, mediaIds) {
    await tx
        .delete(mediaUsages)
        .where(and(eq(mediaUsages.entityType, entityType), eq(mediaUsages.entityId, entityId), eq(mediaUsages.usageKind, usageKind)));
    const unique = [...new Set(mediaIds.filter((id) => Boolean(id)))];
    if (!unique.length)
        return;
    await tx.insert(mediaUsages).values(unique.map((mediaId) => ({
        id: newId(),
        mediaId,
        entityType,
        entityId,
        usageKind,
    })));
}
/** Remove todas as utilizações de uma entidade (ex.: ao eliminá-la). */
export async function clearMediaUsages(tx, entityType, entityId) {
    await tx
        .delete(mediaUsages)
        .where(and(eq(mediaUsages.entityType, entityType), eq(mediaUsages.entityId, entityId)));
}
