import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { listQuerySchema } from '../../lib/pagination.js';
import { batchUpdateArticles, createArticle, duplicateArticle, getArticle, listArticles, listHomepageSlots, softDeleteArticle, transitionArticle, updateArticle, } from '../../services/articles.js';
import { compareRevisions, getRevision, listRevisions, restoreRevision } from '../../services/revisions.js';
const createBody = z.object({
    title: z.string().min(3).max(255),
    summary: z.string().max(2000).optional(),
    subtitle: z.string().max(255).optional(),
    categoryId: z.string().uuid(),
    // Aceite mas ignorado no serviço — autor original = utilizador autenticado.
    authorId: z.string().uuid().optional(),
    contentJson: z.string().optional(),
    contentHtml: z.string().optional(),
});
const updateBody = z
    .object({
    version: z.number().int().positive(),
    title: z.string().min(3).max(255).optional(),
    subtitle: z.string().max(255).nullable().optional(),
    summary: z.string().max(2000).optional(),
    categoryId: z.string().uuid().optional(),
    // Aceite mas ignorado — autor original é imutável.
    authorId: z.string().uuid().optional(),
    contentJson: z.string().optional(),
    contentHtml: z.string().optional(),
    coverMediaId: z.string().uuid().nullable().optional(),
    coverAlt: z.string().max(255).nullable().optional(),
    coverCaption: z.string().max(255).nullable().optional(),
    featured: z.boolean().optional(),
    highlight: z.boolean().optional(),
    releaseHomepageSlotIds: z.array(z.string().uuid()).max(20).optional(),
    seoTitle: z.string().max(255).nullable().optional(),
    seoDescription: z.string().max(320).nullable().optional(),
    noindex: z.boolean().optional(),
    credits: z.string().max(2000).nullable().optional(),
    // Aceite mas ignorado — slug gerido pelo sistema a partir do título.
    slug: z.string().max(191).optional(),
    tags: z.array(z.string()).optional(),
    sources: z.string().max(5000).nullable().optional(),
    location: z.string().max(255).nullable().optional(),
    ogImageMediaId: z.string().uuid().nullable().optional(),
    relatedArticleIds: z.array(z.string().uuid()).max(12).optional(),
    secondaryCategoryIds: z.array(z.string().uuid()).max(5).optional(),
    galleryItems: z
        .array(z.object({
        mediaId: z.string().uuid(),
        caption: z.string().max(255).nullable().optional(),
        sortOrder: z.number().int().min(0).optional(),
    }))
        .max(60)
        .optional(),
})
    .superRefine((value, ctx) => {
    if (value.featured === true && value.highlight === true) {
        ctx.addIssue({
            code: 'custom',
            path: ['featured'],
            message: 'Não pode seleccionar destaque e secundárias em simultâneo.',
        });
    }
});
const batchBody = z
    .object({
    ids: z.array(z.string().uuid()).min(1).max(100),
    action: z.enum(['archive', 'setCategory', 'setStatus']),
    categoryId: z.string().uuid().optional(),
    status: z.string().max(32).optional(),
})
    .superRefine((value, ctx) => {
    if (value.action === 'setCategory' && !value.categoryId) {
        ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Indique a categoria de destino.' });
    }
    if (value.action === 'setStatus' && !value.status) {
        ctx.addIssue({ code: 'custom', path: ['status'], message: 'Indique o estado de destino.' });
    }
});
const transitionBody = z.object({
    version: z.number().int().positive().optional(),
    scheduledAt: z.string().optional(),
});
export const adminArticlesRoutes = async (app) => {
    app.get('/api/admin/articles', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.ARTICLES_READ)],
    }, async (request) => {
        const query = listQuerySchema.parse(request.query);
        return listArticles(query);
    });
    app.get('/api/admin/articles/homepage-slots', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.ARTICLES_READ)],
    }, async () => listHomepageSlots());
    app.get('/api/admin/articles/:id', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.ARTICLES_READ)],
    }, async (request) => {
        const { id } = request.params;
        return getArticle(id);
    });
    app.post('/api/admin/articles', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.ARTICLES_CREATE)],
    }, async (request, reply) => {
        const body = createBody.parse(request.body);
        const article = await createArticle(request.user, body);
        return reply.code(201).send(article);
    });
    app.patch('/api/admin/articles/:id', { preHandler: [app.authenticate] }, async (request) => {
        const { id } = request.params;
        const body = updateBody.parse(request.body);
        return updateArticle(request.user, id, body);
    });
    app.post('/api/admin/articles/batch', { preHandler: [app.authenticate] }, async (request) => {
        const body = batchBody.parse(request.body);
        return batchUpdateArticles(request.user, body);
    });
    app.post('/api/admin/articles/:id/duplicate', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.ARTICLES_CREATE)],
    }, async (request, reply) => {
        const { id } = request.params;
        const article = await duplicateArticle(request.user, id);
        return reply.code(201).send(article);
    });
    app.get('/api/admin/articles/:id/revisions', { preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.ARTICLES_READ)] }, async (request) => {
        const { id } = request.params;
        return { items: await listRevisions(request.user, id) };
    });
    app.get('/api/admin/articles/:id/revisions-compare', { preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.ARTICLES_READ)] }, async (request) => {
        const { id } = request.params;
        const query = z
            .object({ a: z.string().uuid(), b: z.string().uuid() })
            .parse(request.query);
        return compareRevisions(request.user, id, query.a, query.b);
    });
    app.get('/api/admin/articles/:id/revisions/:revisionId', { preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.ARTICLES_READ)] }, async (request) => {
        const { id, revisionId } = request.params;
        return getRevision(request.user, id, revisionId);
    });
    app.post('/api/admin/articles/:id/revisions/:revisionId/restore', { preHandler: [app.authenticate] }, async (request) => {
        const { id, revisionId } = request.params;
        const body = z.object({ version: z.number().int().positive() }).parse(request.body);
        return restoreRevision(request.user, id, revisionId, body.version);
    });
    app.post('/api/admin/articles/:id/:action', { preHandler: [app.authenticate] }, async (request) => {
        const { id, action } = request.params;
        const allowed = new Set([
            'submit',
            'approve',
            'return',
            'reject',
            'publish',
            'schedule',
            'archive',
            'restore',
        ]);
        if (!allowed.has(action)) {
            return app.httpErrors.notFound();
        }
        const body = transitionBody.parse(request.body ?? {});
        return transitionArticle(request.user, id, action, body);
    });
    app.delete('/api/admin/articles/:id', { preHandler: [app.authenticate] }, async (request) => {
        const { id } = request.params;
        return softDeleteArticle(request.user, id);
    });
};
