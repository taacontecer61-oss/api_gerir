import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { DASHBOARD_RANGES, getDashboardStats } from '../../services/dashboard.js';
const dashboardQuery = z.object({
    range: z.enum(DASHBOARD_RANGES).default('7d'),
    from: z.string().optional(),
    to: z.string().optional(),
});
export const adminDashboardRoutes = async (app) => {
    app.get('/api/admin/dashboard', {
        preHandler: [
            app.authenticate,
            app.requirePermission(PERMISSIONS.DASHBOARD_READ),
        ],
    }, async (request) => getDashboardStats(request.user, dashboardQuery.parse(request.query)));
};
