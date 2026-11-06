import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { VIEW_ENTITY_TYPES, getTopContent, getViewsSeries } from '../../services/analytics.js';
import { exportReportsCsv, getReportsOverview, resolveRange } from '../../services/reports.js';
const rangeQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
});
const seriesQuery = rangeQuery.extend({
    entityType: z.enum(VIEW_ENTITY_TYPES).optional(),
});
const topQuery = seriesQuery.extend({
    limit: z.coerce.number().int().positive().max(50).default(10),
});
export const adminReportsRoutes = async (app) => {
    const guard = { preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.REPORTS_READ)] };
    app.get('/api/admin/reports/overview', guard, async (request) => {
        const query = rangeQuery.parse(request.query);
        return getReportsOverview(resolveRange(query.from, query.to));
    });
    app.get('/api/admin/reports/export.csv', guard, async (request, reply) => {
        const query = rangeQuery.parse(request.query);
        const range = resolveRange(query.from, query.to);
        const csv = await exportReportsCsv(range);
        reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="relatorio-${range.from}_${range.to}.csv"`)
            .header('Cache-Control', 'no-store');
        return csv;
    });
    app.get('/api/admin/reports/views', guard, async (request) => {
        const query = seriesQuery.parse(request.query);
        const range = resolveRange(query.from, query.to);
        return { range, series: await getViewsSeries(query.entityType, range.from, range.to) };
    });
    app.get('/api/admin/reports/top-content', guard, async (request) => {
        const query = topQuery.parse(request.query);
        const range = resolveRange(query.from, query.to);
        return {
            range,
            items: await getTopContent(range.from, range.to, query.limit, query.entityType),
        };
    });
};
