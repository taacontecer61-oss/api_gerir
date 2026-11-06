import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { permissions, rolePermissions, userRoles, users } from '../db/schema/index.js';
/** Utilizadores activos que podem assinar conteúdo com a permissão indicada. */
export async function listEligibleAuthors(permission) {
    const rows = await db
        .selectDistinct({
        id: users.id,
        name: users.name,
        isActive: users.isActive,
    })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(and(eq(users.isActive, true), eq(permissions.slug, permission)))
        .orderBy(asc(users.name));
    return rows;
}
/**
 * Autor original: sempre o utilizador autenticado que cria o artigo.
 * Ignora qualquer `authorId` enviado pelo cliente — a autoria não é manipulável.
 */
export function resolveOriginalAuthor(actor) {
    return {
        authorUserId: actor.id,
        authorName: actor.name?.trim() || 'Redacção',
    };
}
/** Mantém a assinatura existente (actualiza o nome se a conta ainda existir). */
export async function keepCurrentByline(userId, fallbackName) {
    if (!userId)
        return { authorUserId: null, authorName: fallbackName || 'Redacção' };
    const [account] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!account)
        return { authorUserId: userId, authorName: fallbackName || 'Redacção' };
    return { authorUserId: account.id, authorName: account.name };
}
/**
 * Compatibilidade: na criação usa sempre o actor; na edição preserva o autor original.
 * O `requestedUserId` é ignorado de propósito.
 */
export async function resolveAuthor(input) {
    if (input.mode === 'create') {
        return resolveOriginalAuthor(input.actor);
    }
    return keepCurrentByline(input.currentUserId ?? null, input.currentName?.trim() || 'Redacção');
}
