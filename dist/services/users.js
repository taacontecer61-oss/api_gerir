import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { roles, userRoles, users } from '../db/schema/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';
import { writeAuditLog } from './audit.js';
import { loadUserPermissions, revokeSessionsForUser } from './auth.js';
export async function listUsers() {
    const rows = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
    }).from(users);
    const result = [];
    for (const row of rows) {
        const access = await loadUserPermissions(row.id);
        result.push({ ...row, roles: access.roles, permissions: access.permissions });
    }
    return result;
}
export async function createUser(input, actorUserId) {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.name.trim() || input.password.length < 12) {
        throw badRequest('INVALID_USER', 'Dados de utilizador inválidos.');
    }
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing)
        throw conflict('USER_EXISTS', 'Já existe um utilizador com este e-mail.');
    const [role] = await db.select().from(roles).where(eq(roles.slug, input.roleSlug)).limit(1);
    if (!role)
        throw badRequest('INVALID_ROLE', 'Função inválida.');
    const id = newId();
    await db.insert(users).values({
        id,
        email,
        name: input.name.trim(),
        passwordHash: await hashPassword(input.password),
        isActive: true,
    });
    await db.insert(userRoles).values({ userId: id, roleId: role.id });
    await writeAuditLog({
        actorUserId,
        action: 'user.create',
        entityType: 'user',
        entityId: id,
    });
    const [created] = await listUsers().then((all) => all.filter((u) => u.id === id));
    return created;
}
export async function updateUser(id, input, actorUserId) {
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing)
        throw notFound('Utilizador não encontrado.');
    if (input.isActive === false && id === actorUserId) {
        throw badRequest('SELF_DEACTIVATE', 'Não pode desactivar a sua própria conta.');
    }
    await db
        .update(users)
        .set({
        name: input.name?.trim() ?? existing.name,
        isActive: input.isActive ?? existing.isActive,
        ...(input.password
            ? { passwordHash: await hashPassword(input.password) }
            : {}),
    })
        .where(eq(users.id, id));
    if (input.password)
        await revokeSessionsForUser(id);
    if (input.roleSlug) {
        const [role] = await db.select().from(roles).where(eq(roles.slug, input.roleSlug)).limit(1);
        if (!role)
            throw badRequest('INVALID_ROLE', 'Função inválida.');
        await db.delete(userRoles).where(eq(userRoles.userId, id));
        await db.insert(userRoles).values({ userId: id, roleId: role.id });
    }
    await writeAuditLog({
        actorUserId,
        action: 'user.update',
        entityType: 'user',
        entityId: id,
    });
    return (await listUsers()).find((u) => u.id === id);
}
export async function listRoles() {
    return db.select().from(roles);
}
