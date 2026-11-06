import { and, count, desc, eq, like, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { redirects } from '../db/schema/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAll } from '../lib/guards.js';
import { newId } from '../lib/ids.js';
import { paginateMeta } from '../lib/pagination.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { writeAuditLog } from './audit.js';
export const REDIRECT_STATUSES = [301, 302, 307, 308];
const RESERVED_PREFIXES = ['/api/', '/media/'];
const MAX_HOPS = 5;
function likePattern(q) {
    return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
/** Normaliza um caminho interno: sem query/hash, sem barra final (excepto «/»). */
export function normalizePath(input) {
    const withoutQuery = input.trim().split(/[?#]/)[0] ?? '';
    const collapsed = withoutQuery.replace(/\/{2,}/g, '/');
    if (collapsed.length > 1 && collapsed.endsWith('/'))
        return collapsed.slice(0, -1);
    return collapsed;
}
function assertFromPath(path) {
    if (!path.startsWith('/') || /\s/.test(path) || path.length > 255) {
        throw badRequest('INVALID_FROM_PATH', 'O caminho de origem deve começar por «/» e não conter espaços.');
    }
    if (path === '/')
        throw badRequest('INVALID_FROM_PATH', 'Não é possível redireccionar a página inicial.');
    if (RESERVED_PREFIXES.some((prefix) => `${path}/`.startsWith(prefix))) {
        throw badRequest('INVALID_FROM_PATH', 'Caminhos «/api» e «/media» não podem ser redireccionados.');
    }
}
function normalizeTarget(target) {
    const trimmed = target.trim();
    if (/\s/.test(trimmed) || trimmed.length > 255) {
        throw badRequest('INVALID_TO_PATH', 'O destino é inválido.');
    }
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            new URL(trimmed);
        }
        catch {
            throw badRequest('INVALID_TO_PATH', 'O destino é inválido.');
        }
        return trimmed;
    }
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
        throw badRequest('INVALID_TO_PATH', 'O destino deve começar por «/» ou ser um URL http(s).');
    }
    return trimmed;
}
export async function listRedirects(user, input) {
    requireAll(user, PERMISSIONS.SETTINGS_MANAGE);
    const pattern = input.q?.trim() ? likePattern(input.q.trim()) : null;
    const where = pattern
        ? or(like(redirects.fromPath, pattern), like(redirects.toPath, pattern))
        : undefined;
    const [totalRow] = await db.select({ total: count() }).from(redirects).where(where);
    const meta = paginateMeta(Number(totalRow.total), input.page, input.pageSize);
    const items = await db
        .select()
        .from(redirects)
        .where(where)
        .orderBy(desc(redirects.createdAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return { items, ...meta };
}
/**
 * Cria (ou actualiza) um redireccionamento interno quando o slug de um artigo muda.
 * Sem verificação de permissões — uso exclusivo dos serviços de artigos.
 */
export async function upsertInternalRedirect(fromPathRaw, toPathRaw) {
    try {
        const fromPath = normalizePath(fromPathRaw.startsWith('/') ? fromPathRaw : `/${fromPathRaw}`);
        const toPath = normalizeTarget(toPathRaw.startsWith('/') ? toPathRaw : `/${toPathRaw}`);
        if (fromPath === toPath)
            return;
        assertFromPath(fromPath);
        const [existing] = await db
            .select({ id: redirects.id })
            .from(redirects)
            .where(eq(redirects.fromPath, fromPath))
            .limit(1);
        if (existing) {
            await db.update(redirects).set({ toPath, httpStatus: 301 }).where(eq(redirects.id, existing.id));
            return;
        }
        await db.insert(redirects).values({
            id: newId(),
            fromPath,
            toPath,
            httpStatus: 301,
        });
    }
    catch {
        // Não bloquear a edição do artigo se o redireccionamento falhar.
    }
}
export async function createRedirect(user, input) {
    requireAll(user, PERMISSIONS.SETTINGS_MANAGE);
    const fromPath = normalizePath(input.fromPath);
    assertFromPath(fromPath);
    const toPath = normalizeTarget(input.toPath);
    const httpStatus = input.httpStatus ?? 301;
    if (!REDIRECT_STATUSES.includes(httpStatus)) {
        throw badRequest('INVALID_STATUS', 'Código HTTP inválido (301, 302, 307 ou 308).');
    }
    if (normalizePath(toPath) === fromPath) {
        throw badRequest('REDIRECT_LOOP', 'A origem e o destino não podem ser iguais.');
    }
    const [existing] = await db
        .select({ id: redirects.id })
        .from(redirects)
        .where(eq(redirects.fromPath, fromPath))
        .limit(1);
    if (existing)
        throw conflict('REDIRECT_EXISTS', 'Já existe um redireccionamento para este caminho.');
    // Evita ciclos directos A -> B -> A.
    const [reverse] = await db
        .select({ id: redirects.id })
        .from(redirects)
        .where(and(eq(redirects.fromPath, normalizePath(toPath)), eq(redirects.toPath, fromPath)))
        .limit(1);
    if (reverse)
        throw badRequest('REDIRECT_LOOP', 'Este redireccionamento criaria um ciclo.');
    const id = newId();
    await db.insert(redirects).values({ id, fromPath, toPath, httpStatus });
    await writeAuditLog({
        actorUserId: user.id,
        action: 'redirect.create',
        entityType: 'redirect',
        entityId: id,
        meta: { fromPath, toPath, httpStatus },
    });
    const [row] = await db.select().from(redirects).where(eq(redirects.id, id)).limit(1);
    return row;
}
export async function deleteRedirect(user, id) {
    requireAll(user, PERMISSIONS.SETTINGS_MANAGE);
    const [existing] = await db.select().from(redirects).where(eq(redirects.id, id)).limit(1);
    if (!existing)
        throw notFound('Redireccionamento não encontrado.');
    await db.delete(redirects).where(eq(redirects.id, id));
    await writeAuditLog({
        actorUserId: user.id,
        action: 'redirect.delete',
        entityType: 'redirect',
        entityId: id,
        meta: { fromPath: existing.fromPath },
    });
    return { ok: true };
}
/** Resolução pública: segue cadeias curtas e devolve o destino final. */
export async function resolveRedirect(path) {
    let current = normalizePath(path);
    if (!current.startsWith('/'))
        throw badRequest('INVALID_PATH', 'Caminho inválido.');
    let match = null;
    const seen = new Set();
    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
        if (seen.has(current))
            break;
        seen.add(current);
        const [row] = await db
            .select({ toPath: redirects.toPath, httpStatus: redirects.httpStatus })
            .from(redirects)
            .where(eq(redirects.fromPath, current))
            .limit(1);
        if (!row)
            break;
        match = row;
        if (/^https?:\/\//i.test(row.toPath))
            break;
        current = normalizePath(row.toPath);
    }
    if (!match)
        return { found: false };
    return { found: true, toPath: match.toPath, httpStatus: match.httpStatus };
}
