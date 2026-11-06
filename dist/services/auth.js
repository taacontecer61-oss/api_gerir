import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { env, isProd } from '../config.js';
import { db } from '../db/index.js';
import { loginAttempts, passwordResets, permissions, rolePermissions, roles, sessions, userRoles, users, } from '../db/schema/index.js';
import { badRequest, forbidden, tooManyRequests, unauthorized, } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createSessionToken, hashToken } from '../lib/tokens.js';
import { sendPasswordResetEmail } from '../lib/mail.js';
import { writeAuditLog } from './audit.js';
const MAX_FAILED_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MINUTES = 15;
async function countRecentFailures(email) {
    const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000);
    const [row] = await db
        .select({ total: count() })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.email, email.toLowerCase()), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, windowStart)));
    return Number(row?.total ?? 0);
}
async function recordAttempt(input) {
    await db.insert(loginAttempts).values({
        email: input.email.toLowerCase(),
        ip: input.ip ?? null,
        succeeded: input.succeeded,
    });
}
export async function loadUserPermissions(userId) {
    const rows = await db
        .select({
        roleSlug: roles.slug,
        permissionSlug: permissions.slug,
    })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(userRoles.userId, userId));
    const roleSet = new Set();
    const permissionSet = new Set();
    for (const row of rows) {
        roleSet.add(row.roleSlug);
        if (row.permissionSlug) {
            permissionSet.add(row.permissionSlug);
        }
    }
    return {
        roles: [...roleSet],
        permissions: [...permissionSet],
    };
}
export async function login(input) {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
        throw badRequest('INVALID_CREDENTIALS', 'E-mail e palavra-passe são obrigatórios.');
    }
    const failures = await countRecentFailures(email);
    if (failures >= MAX_FAILED_ATTEMPTS) {
        await writeAuditLog({
            action: 'auth.login_locked',
            entityType: 'user',
            meta: { email },
            ip: input.ip,
        });
        throw tooManyRequests('Demasiadas tentativas falhadas. Aguarde alguns minutos e tente novamente.');
    }
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const passwordOk = user != null && (await verifyPassword(user.passwordHash, input.password));
    if (!user || !passwordOk) {
        await recordAttempt({ email, ip: input.ip, succeeded: false });
        await writeAuditLog({
            action: 'auth.login_failed',
            entityType: 'user',
            entityId: user?.id,
            meta: { email },
            ip: input.ip,
        });
        throw unauthorized('Credenciais inválidas.');
    }
    if (!user.isActive) {
        await recordAttempt({ email, ip: input.ip, succeeded: false });
        throw forbidden('Esta conta está desactivada.');
    }
    await recordAttempt({ email, ip: input.ip, succeeded: true });
    const token = createSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60_000);
    const sessionId = newId();
    await db.insert(sessions).values({
        id: sessionId,
        userId: user.id,
        tokenHash,
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 255) ?? null,
    });
    await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));
    const access = await loadUserPermissions(user.id);
    await writeAuditLog({
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        ip: input.ip,
    });
    return {
        token,
        expiresAt,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: access.roles,
            permissions: access.permissions,
        },
    };
}
export async function logout(token, ip) {
    if (!token)
        return;
    const tokenHash = hashToken(token);
    const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
    if (!session || session.revokedAt)
        return;
    await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, session.id));
    await writeAuditLog({
        actorUserId: session.userId,
        action: 'auth.logout',
        entityType: 'session',
        entityId: session.id,
        ip,
    });
}
export async function resolveSession(token) {
    if (!token)
        return null;
    const tokenHash = hashToken(token);
    const [row] = await db
        .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        userId: users.id,
        email: users.email,
        name: users.name,
        isActive: users.isActive,
    })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
        .limit(1);
    if (!row)
        return null;
    if (!row.isActive)
        return null;
    if (row.expiresAt.getTime() <= Date.now()) {
        await db
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(eq(sessions.id, row.sessionId));
        return null;
    }
    const access = await loadUserPermissions(row.userId);
    return {
        id: row.userId,
        email: row.email,
        name: row.name,
        roles: access.roles,
        permissions: access.permissions,
    };
}
export async function ensurePasswordHash(password) {
    return hashPassword(password);
}
/** Limpeza ocasional de sessões expiradas. */
export async function revokeSessionsForUser(userId) {
    await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
export async function purgeExpiredSessions() {
    await db
        .update(sessions)
        .set({ revokedAt: sql `COALESCE(${sessions.revokedAt}, CURRENT_TIMESTAMP(3))` })
        .where(and(isNull(sessions.revokedAt), sql `${sessions.expiresAt} <= UTC_TIMESTAMP(3)`));
}
export async function recentLoginFailures(limit = 10) {
    return db
        .select({
        email: loginAttempts.email,
        ip: loginAttempts.ip,
        succeeded: loginAttempts.succeeded,
        createdAt: loginAttempts.createdAt,
    })
        .from(loginAttempts)
        .orderBy(desc(loginAttempts.createdAt))
        .limit(limit);
}
const RESET_TTL_MS = 30 * 60_000;
/** Resposta idêntica exista ou não a conta, para não revelar e-mails registados. */
export async function requestPasswordReset(email) {
    const normalized = email.trim().toLowerCase();
    const [user] = await db
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(eq(users.email, normalized))
        .limit(1);
    if (!user?.isActive)
        return { ok: true };
    const token = createSessionToken();
    await db.insert(passwordResets).values({
        id: newId(),
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    const mailed = await sendPasswordResetEmail(normalized, token).catch(() => false);
    if (!mailed && !isProd)
        return { ok: true, devResetToken: token };
    return { ok: true };
}
export async function confirmPasswordReset(token, password) {
    if (password.length < 12) {
        throw badRequest('WEAK_PASSWORD', 'A palavra-passe deve ter pelo menos 12 caracteres.');
    }
    const tokenHash = hashToken(token);
    const [row] = await db
        .select()
        .from(passwordResets)
        .where(eq(passwordResets.tokenHash, tokenHash))
        .limit(1);
    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
        throw badRequest('INVALID_RESET', 'A ligação de recuperação é inválida ou expirou.');
    }
    await db
        .update(users)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(users.id, row.userId));
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
    await revokeSessionsForUser(row.userId);
    await writeAuditLog({
        actorUserId: row.userId,
        action: 'auth.password_reset',
        entityType: 'user',
        entityId: row.userId,
    });
    return { ok: true };
}
