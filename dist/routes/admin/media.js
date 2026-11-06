import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { listQuerySchema } from '../../lib/pagination.js';
import { deleteMedia, listMedia, resolveMediaFile, saveUploadedMedia, updateMediaMeta, } from '../../services/media.js';
const mediaListQuery = listQuerySchema.extend({
    unused: z.enum(['true', 'false', '1', '0']).optional(),
});
const metaBody = z.object({
    altText: z.string().max(255).nullable().optional(),
    caption: z.string().max(255).nullable().optional(),
    credit: z.string().max(255).nullable().optional(),
});
export const adminMediaRoutes = async (app) => {
    app.get('/api/admin/media', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.MEDIA_UPLOAD)],
    }, async (request) => {
        const query = mediaListQuery.parse(request.query);
        return listMedia({
            page: query.page,
            pageSize: query.pageSize,
            q: query.q,
            unused: query.unused === 'true' || query.unused === '1',
        });
    });
    app.post('/api/admin/media', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.MEDIA_UPLOAD)],
    }, async (request, reply) => {
        const file = await request.file();
        if (!file) {
            return reply.code(400).send({
                error: { code: 'FILE_REQUIRED', message: 'Envie um ficheiro.' },
            });
        }
        const fields = file.fields;
        const media = await saveUploadedMedia({
            filename: file.filename,
            mimetype: file.mimetype,
            file: file.file,
            uploadedByUserId: request.user.id,
            altText: fields.altText?.value,
            caption: fields.caption?.value,
            credit: fields.credit?.value,
        });
        return reply.code(201).send(media);
    });
    app.patch('/api/admin/media/:id', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.MEDIA_UPLOAD)],
    }, async (request) => {
        const { id } = request.params;
        const body = metaBody.parse(request.body);
        return updateMediaMeta(id, body, request.user.id);
    });
    app.delete('/api/admin/media/:id', {
        preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.MEDIA_DELETE)],
    }, async (request) => {
        const { id } = request.params;
        return deleteMedia(id, request.user.id);
    });
    app.get('/media/:id/:variant', async (request, reply) => {
        const { id, variant } = request.params;
        if (variant !== 'original' && variant !== 'thumb' && variant !== 'card' && variant !== 'hero') {
            return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Variante inválida.' } });
        }
        const file = await resolveMediaFile(id, variant);
        try {
            await access(file.path);
        }
        catch {
            return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Ficheiro em falta.' } });
        }
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'public, max-age=2592000');
        reply.type(file.mimeType);
        return reply.send(createReadStream(file.path));
    });
};
