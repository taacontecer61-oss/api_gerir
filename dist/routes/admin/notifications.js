import { z } from 'zod';
import { listNotifications, markNotificationsRead, unreadCount, } from '../../services/notifications.js';
const listQuery = z.object({
    unreadOnly: z
        .enum(['true', 'false', '1', '0'])
        .optional()
        .transform((value) => value === 'true' || value === '1'),
    limit: z.coerce.number().int().positive().max(100).default(40),
});
const readBody = z.object({
    ids: z.array(z.string().uuid()).max(100).optional(),
});
export const adminNotificationsRoutes = async (app) => {
    app.get('/api/admin/notifications', { preHandler: [app.authenticate] }, async (request) => {
        const query = listQuery.parse(request.query);
        const user = request.user;
        const [items, unread] = await Promise.all([
            listNotifications(user.id, { unreadOnly: query.unreadOnly, limit: query.limit }),
            unreadCount(user.id),
        ]);
        return { items, unread };
    });
    app.get('/api/admin/notifications/unread-count', { preHandler: [app.authenticate] }, async (request) => ({ unread: await unreadCount(request.user.id) }));
    app.post('/api/admin/notifications/read', { preHandler: [app.authenticate] }, async (request) => {
        const body = readBody.parse(request.body ?? {});
        return markNotificationsRead(request.user.id, body.ids);
    });
};
