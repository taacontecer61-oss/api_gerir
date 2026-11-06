import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config.js';
import { resolveCountryCode } from '../../lib/geo.js';
import { getAllSettings } from '../../services/settings.js';
import { hasCategoryConsent } from '../../services/consent.js';
import { VIEW_ENTITY_TYPES, luandaDay, recordPageView } from '../../services/analytics.js';
const viewBody = z.object({
    entityType: z.enum(VIEW_ENTITY_TYPES),
    entityId: z.string().uuid(),
});
export const publicAnalyticsRoutes = async (app) => {
    app.post('/api/public/events/view', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const body = viewBody.parse(request.body);
        const settings = await getAllSettings();
        if (settings['analytics.enabled'] !== true) {
            return reply.code(202).send({ ok: true, recorded: false });
        }
        const header = request.headers['x-kn-consent'];
        const visitorId = Array.isArray(header) ? header[0] : header;
        if (!visitorId || !(await hasCategoryConsent(visitorId, 'analytics'))) {
            return reply.code(202).send({ ok: true, recorded: false });
        }
        const userAgent = String(request.headers['user-agent'] ?? '').slice(0, 255);
        const sessionHash = createHash('sha256')
            .update(`${env.SESSION_SECRET}|${luandaDay()}|${request.ip}|${userAgent}`)
            .digest('hex');
        const countryCode = resolveCountryCode(request.headers, request.ip);
        await recordPageView({ ...body, sessionHash, countryCode });
        return reply.code(202).send({ ok: true });
    });
};
