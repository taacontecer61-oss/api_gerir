import { z } from 'zod';
import { createGallery, deleteGallery, getGallery, listGalleries, setGalleryPublished, updateGallery, } from '../../services/galleries.js';
/** URL http(s) ou caminho interno (ex.: /media/:id/original). */
const assetUrl = z
    .string()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value) || (value.startsWith('/') && !value.startsWith('//')), {
    message: 'URL inválido.',
});
const listQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(50).default(20),
    q: z.string().max(100).optional(),
    isPublished: z.enum(['true', 'false']).optional(),
});
const photoBody = z.object({
    mediaId: z.string().uuid().nullable().optional(),
    src: assetUrl.optional(),
    alt: z.string().min(1).max(255),
    caption: z.string().max(255).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
});
const createBody = z.object({
    title: z.string().min(3).max(255),
    description: z.string().max(5000),
    coverUrl: assetUrl.optional(),
    coverMediaId: z.string().uuid().nullable().optional(),
    publishedAt: z.string().optional(),
    isPublished: z.boolean().optional(),
    slug: z.string().max(191).optional(),
    photos: z.array(photoBody).max(200).optional(),
});
const updateBody = createBody.partial();
export const adminGalleriesRoutes = async (app) => {
    const auth = { preHandler: [app.authenticate] };
    app.get('/api/admin/galleries', auth, async (request) => {
        const query = listQuery.parse(request.query);
        return listGalleries(request.user, {
            page: query.page,
            pageSize: query.pageSize,
            q: query.q,
            isPublished: query.isPublished ? query.isPublished === 'true' : undefined,
        });
    });
    app.get('/api/admin/galleries/:id', auth, async (request) => {
        const { id } = request.params;
        return getGallery(request.user, id);
    });
    app.post('/api/admin/galleries', auth, async (request, reply) => {
        const body = createBody.parse(request.body);
        return reply.code(201).send(await createGallery(request.user, body));
    });
    app.patch('/api/admin/galleries/:id', auth, async (request) => {
        const { id } = request.params;
        const body = updateBody.parse(request.body);
        return updateGallery(request.user, id, body);
    });
    app.post('/api/admin/galleries/:id/publish', auth, async (request) => {
        const { id } = request.params;
        return setGalleryPublished(request.user, id, true);
    });
    app.post('/api/admin/galleries/:id/unpublish', auth, async (request) => {
        const { id } = request.params;
        return setGalleryPublished(request.user, id, false);
    });
    app.delete('/api/admin/galleries/:id', auth, async (request) => {
        const { id } = request.params;
        return deleteGallery(request.user, id);
    });
};
