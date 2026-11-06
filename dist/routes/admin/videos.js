import { z } from 'zod';
import { createVideo, deleteVideo, getVideo, listVideos, setVideoPublished, updateVideo, } from '../../services/videos.js';
/** URL http(s) ou caminho interno (ex.: /media/:id/original). */
const assetUrl = z
    .string()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value) || (value.startsWith('/') && !value.startsWith('//')), {
    message: 'URL inválido.',
});
const httpUrl = z
    .string()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), { message: 'URL inválido.' });
const listQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(50).default(20),
    q: z.string().max(100).optional(),
    categoryId: z.string().uuid().optional(),
    isPublished: z.enum(['true', 'false']).optional(),
});
const createBody = z.object({
    title: z.string().min(3).max(255),
    description: z.string().max(5000),
    categoryId: z.string().uuid(),
    duration: z.string().max(16),
    thumbnailUrl: assetUrl,
    sourceUrl: httpUrl.nullable().optional(),
    publishedAt: z.string().optional(),
    isPublished: z.boolean().optional(),
    slug: z.string().max(191).optional(),
});
const updateBody = createBody.partial();
export const adminVideosRoutes = async (app) => {
    const auth = { preHandler: [app.authenticate] };
    app.get('/api/admin/videos', auth, async (request) => {
        const query = listQuery.parse(request.query);
        return listVideos(request.user, {
            page: query.page,
            pageSize: query.pageSize,
            q: query.q,
            categoryId: query.categoryId,
            isPublished: query.isPublished ? query.isPublished === 'true' : undefined,
        });
    });
    app.get('/api/admin/videos/:id', auth, async (request) => {
        const { id } = request.params;
        return getVideo(request.user, id);
    });
    app.post('/api/admin/videos', auth, async (request, reply) => {
        const body = createBody.parse(request.body);
        return reply.code(201).send(await createVideo(request.user, body));
    });
    app.patch('/api/admin/videos/:id', auth, async (request) => {
        const { id } = request.params;
        const body = updateBody.parse(request.body);
        return updateVideo(request.user, id, body);
    });
    app.post('/api/admin/videos/:id/publish', auth, async (request) => {
        const { id } = request.params;
        return setVideoPublished(request.user, id, true);
    });
    app.post('/api/admin/videos/:id/unpublish', auth, async (request) => {
        const { id } = request.params;
        return setVideoPublished(request.user, id, false);
    });
    app.delete('/api/admin/videos/:id', auth, async (request) => {
        const { id } = request.params;
        return deleteVideo(request.user, id);
    });
};
