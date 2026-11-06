import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { createCategory, createTag, deleteTag, listCategories, listTags, updateCategory, } from '../../services/taxonomy.js';
export const adminTaxonomyRoutes = async (app) => {
    app.get('/api/admin/categories', { preHandler: [app.authenticate] }, async () => listCategories());
    app.post('/api/admin/categories', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.CATEGORIES_MANAGE)],
    }, async (request, reply) => {
        const body = z
            .object({
            name: z.string().min(2),
            description: z.string().nullable().optional(),
            slug: z.string().min(2).optional(),
            sortOrder: z.number().int().optional(),
            isActive: z.boolean().optional(),
            seoTitle: z.string().max(255).nullable().optional(),
            seoDescription: z.string().max(320).nullable().optional(),
        })
            .parse(request.body);
        const category = await createCategory(body, request.user.id);
        return reply.code(201).send(category);
    });
    app.patch('/api/admin/categories/:id', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.CATEGORIES_MANAGE)],
    }, async (request) => {
        const { id } = request.params;
        const body = z
            .object({
            name: z.string().min(2).optional(),
            description: z.string().nullable().optional(),
            isActive: z.boolean().optional(),
            sortOrder: z.number().int().optional(),
            seoTitle: z.string().max(255).nullable().optional(),
            seoDescription: z.string().max(320).nullable().optional(),
        })
            .parse(request.body);
        return updateCategory(id, body, request.user.id);
    });
    app.get('/api/admin/tags', { preHandler: [app.authenticate] }, async (request) => {
        const query = z.object({ q: z.string().optional() }).parse(request.query);
        return listTags(query.q);
    });
    app.post('/api/admin/tags', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.TAGS_MANAGE)],
    }, async (request, reply) => {
        const body = z.object({ name: z.string().min(1) }).parse(request.body);
        const tag = await createTag(body.name, request.user.id);
        return reply.code(201).send(tag);
    });
    app.delete('/api/admin/tags/:id', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.TAGS_MANAGE)],
    }, async (request) => {
        const { id } = request.params;
        return deleteTag(id, request.user.id);
    });
};
