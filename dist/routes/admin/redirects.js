import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { createRedirect, deleteRedirect, listRedirects } from '../../services/redirects.js';
const listQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    q: z.string().max(100).optional(),
});
const createBody = z.object({
    fromPath: z.string().min(1).max(255),
    toPath: z.string().min(1).max(255),
    httpStatus: z.number().int().optional(),
});
export const adminRedirectsRoutes = async (app) => {
    const guard = {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.SETTINGS_MANAGE)],
    };
    app.get('/api/admin/redirects', guard, async (request) => {
        const query = listQuery.parse(request.query);
        return listRedirects(request.user, query);
    });
    app.post('/api/admin/redirects', guard, async (request, reply) => {
        const body = createBody.parse(request.body);
        return reply.code(201).send(await createRedirect(request.user, body));
    });
    app.delete('/api/admin/redirects/:id', guard, async (request) => {
        const { id } = request.params;
        return deleteRedirect(request.user, id);
    });
};
