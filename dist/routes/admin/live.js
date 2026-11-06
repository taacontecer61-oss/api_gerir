import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { listQuerySchema } from '../../lib/pagination.js';
import { LIVE_ACTIONS, LIVE_UPDATE_ACTIONS, createCoverage, createUpdate, deleteUpdate, editUpdate, getCoverage, getUpdate, listCoverages, listUpdates, softDeleteCoverage, transitionCoverage, transitionUpdate, updateCoverage, } from '../../services/live.js';
const createBody = z.object({
    title: z.string().min(3).max(255),
    summary: z.string().min(3).max(2000),
    descriptionHtml: z.string().max(100_000).nullable().optional(),
    categoryId: z.string().uuid(),
    authorId: z.string().uuid().optional(),
    coverMediaId: z.string().uuid().nullable().optional(),
    coverAlt: z.string().max(255).nullable().optional(),
    featured: z.boolean().optional(),
    seoTitle: z.string().max(255).nullable().optional(),
    seoDescription: z.string().max(320).nullable().optional(),
    noindex: z.boolean().optional(),
    streamEmbedUrl: z.string().max(500).nullable().optional(),
    scheduledStartAt: z.string().nullable().optional(),
    slug: z.string().max(191).optional(),
});
const updateBody = createBody.partial().extend({
    version: z.number().int().positive(),
});
const transitionBody = z.object({
    version: z.number().int().positive().optional(),
    scheduledStartAt: z.string().optional(),
});
const updatesQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(50).default(20),
    status: z.string().optional(),
});
const liveUpdateBody = z.object({
    title: z.string().max(255).nullable().optional(),
    bodyHtml: z.string().min(1).max(100_000),
    bodyJson: z.string().max(200_000).nullable().optional(),
    eventAt: z.string().optional(),
    isImportant: z.boolean().optional(),
    sourceUrl: z.string().max(500).nullable().optional(),
    mediaId: z.string().uuid().nullable().optional(),
    mediaCaption: z.string().max(255).nullable().optional(),
    publish: z.boolean().optional(),
});
const liveUpdatePatch = liveUpdateBody.omit({ publish: true }).partial().extend({
    version: z.number().int().positive(),
});
const updateTransitionBody = z.object({
    version: z.number().int().positive().optional(),
});
export const adminLiveRoutes = async (app) => {
    const read = [app.authenticate, app.requirePermission(PERMISSIONS.LIVE_READ)];
    const manage = [app.authenticate, app.requirePermission(PERMISSIONS.LIVE_MANAGE)];
    app.get('/api/admin/live', { preHandler: read }, async (request) => {
        const query = listQuerySchema.parse(request.query);
        return listCoverages(request.user, query);
    });
    app.get('/api/admin/live/:id', { preHandler: read }, async (request) => {
        const { id } = request.params;
        return getCoverage(request.user, id);
    });
    app.post('/api/admin/live', { preHandler: manage }, async (request, reply) => {
        const body = createBody.parse(request.body);
        const coverage = await createCoverage(request.user, body);
        return reply.code(201).send(coverage);
    });
    app.patch('/api/admin/live/:id', { preHandler: manage }, async (request) => {
        const { id } = request.params;
        const body = updateBody.parse(request.body);
        return updateCoverage(request.user, id, body);
    });
    app.delete('/api/admin/live/:id', { preHandler: manage }, async (request) => {
        const { id } = request.params;
        return softDeleteCoverage(request.user, id);
    });
    // Rotas /updates antes de /:action para não capturar «updates» como acção.
    app.get('/api/admin/live/:id/updates', { preHandler: read }, async (request) => {
        const { id } = request.params;
        const query = updatesQuery.parse(request.query);
        return listUpdates(request.user, id, query);
    });
    app.get('/api/admin/live/:id/updates/:updateId', { preHandler: read }, async (request) => {
        const { id, updateId } = request.params;
        return getUpdate(request.user, id, updateId);
    });
    app.post('/api/admin/live/:id/updates', { preHandler: manage }, async (request, reply) => {
        const { id } = request.params;
        const body = liveUpdateBody.parse(request.body);
        const created = await createUpdate(request.user, id, body);
        return reply.code(201).send(created);
    });
    app.patch('/api/admin/live/:id/updates/:updateId', { preHandler: manage }, async (request) => {
        const { id, updateId } = request.params;
        const body = liveUpdatePatch.parse(request.body);
        return editUpdate(request.user, id, updateId, body);
    });
    app.delete('/api/admin/live/:id/updates/:updateId', { preHandler: manage }, async (request) => {
        const { id, updateId } = request.params;
        return deleteUpdate(request.user, id, updateId);
    });
    app.post('/api/admin/live/:id/updates/:updateId/:action', { preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.LIVE_MANAGE)] }, async (request) => {
        const { id, updateId, action } = request.params;
        if (!LIVE_UPDATE_ACTIONS.includes(action)) {
            return app.httpErrors.notFound();
        }
        const body = updateTransitionBody.parse(request.body ?? {});
        return transitionUpdate(request.user, id, updateId, action, body);
    });
    app.post('/api/admin/live/:id/:action', { preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.LIVE_PUBLISH)] }, async (request) => {
        const { id, action } = request.params;
        if (!LIVE_ACTIONS.includes(action)) {
            return app.httpErrors.notFound();
        }
        const body = transitionBody.parse(request.body ?? {});
        return transitionCoverage(request.user, id, action, body);
    });
};
