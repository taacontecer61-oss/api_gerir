import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { forbidden } from '../../lib/errors.js';
import { listEligibleAuthors } from '../../services/authorship.js';
import { createUser, listRoles, listUsers, updateUser } from '../../services/users.js';
export const adminUsersRoutes = async (app) => {
    app.get('/api/admin/editorial-users', { preHandler: [app.authenticate] }, async (request) => {
        const kind = z.enum(['articles', 'live']).default('articles').parse(request.query.for ?? 'articles');
        const user = request.user;
        if (kind === 'articles') {
            const allowed = user.permissions.includes(PERMISSIONS.ARTICLES_READ) ||
                user.permissions.includes(PERMISSIONS.ARTICLES_CREATE);
            if (!allowed)
                throw forbidden();
            return listEligibleAuthors(PERMISSIONS.ARTICLES_CREATE);
        }
        const allowed = user.permissions.includes(PERMISSIONS.LIVE_READ) ||
            user.permissions.includes(PERMISSIONS.LIVE_MANAGE);
        if (!allowed)
            throw forbidden();
        return listEligibleAuthors(PERMISSIONS.LIVE_MANAGE);
    });
    app.get('/api/admin/users', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.USERS_MANAGE)],
    }, async () => listUsers());
    app.get('/api/admin/roles', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.USERS_MANAGE)],
    }, async () => listRoles());
    app.post('/api/admin/users', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.USERS_MANAGE)],
    }, async (request, reply) => {
        const body = z
            .object({
            email: z.email(),
            name: z.string().min(2),
            password: z.string().min(12),
            roleSlug: z.string().min(2),
        })
            .parse(request.body);
        const user = await createUser(body, request.user.id);
        return reply.code(201).send(user);
    });
    app.patch('/api/admin/users/:id', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.USERS_MANAGE)],
    }, async (request) => {
        const { id } = request.params;
        const body = z
            .object({
            name: z.string().min(2).optional(),
            isActive: z.boolean().optional(),
            roleSlug: z.string().min(2).optional(),
            password: z.string().min(12).optional(),
        })
            .parse(request.body);
        return updateUser(id, body, request.user.id);
    });
};
