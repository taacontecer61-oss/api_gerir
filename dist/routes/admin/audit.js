import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { listAuditLogs } from '../../services/audit.js';
const auditQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
    q: z.string().max(100).optional(),
    action: z.string().max(96).optional(),
    entityType: z.string().max(64).optional(),
    entityId: z.string().max(36).optional(),
    actorUserId: z.string().max(36).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
});
export const adminAuditRoutes = async (app) => {
    app.get('/api/admin/audit', { preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.AUDIT_READ)] }, async (request) => listAuditLogs(auditQuery.parse(request.query)));
};
