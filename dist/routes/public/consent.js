import { z } from 'zod';
import { resolveCountryCode } from '../../lib/geo.js';
import { jurisdictionBucket } from '../../lib/jurisdiction.js';
import { getPublicCookiePolicy, listCategories } from '../../services/cookie-catalog.js';
import { getConsentPreferences, recordConsent, recordNotice, withdrawConsent } from '../../services/consent.js';
const visitorId = z.string().uuid();
const preferences = z
    .object({
    preferences: z.boolean().optional(),
    analytics: z.boolean().optional(),
    marketing: z.boolean().optional(),
    personalization: z.boolean().optional(),
})
    .optional();
const decisionBody = z.object({
    visitorId,
    action: z.enum(['accept_all', 'reject_optional', 'custom']),
    preferences,
    policyVersion: z.string().min(4).max(32),
});
const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
function jurisdictionOf(request) {
    return jurisdictionBucket(resolveCountryCode(request.headers, request.ip));
}
export const publicConsentRoutes = async (app) => {
    app.get('/api/cookies/categories', async (request) => ({
        categories: await listCategories({ activeOnly: true }),
        jurisdiction: jurisdictionOf(request),
    }));
    app.get('/api/cookies/policy', async (request) => getPublicCookiePolicy(jurisdictionOf(request)));
    app.get('/api/consent/preferences', limit, async (request) => {
        const query = z.object({ visitorId }).parse(request.query);
        return getConsentPreferences(query.visitorId);
    });
    app.post('/api/consent', limit, async (request) => {
        const body = decisionBody.parse(request.body);
        return recordConsent({
            visitorId: body.visitorId,
            action: body.action,
            preferences: body.preferences,
            policyVersion: body.policyVersion,
            jurisdiction: jurisdictionOf(request),
        });
    });
    app.put('/api/consent/preferences', limit, async (request) => {
        const body = decisionBody.parse(request.body);
        return recordConsent({
            visitorId: body.visitorId,
            action: body.action,
            preferences: body.preferences,
            policyVersion: body.policyVersion,
            jurisdiction: jurisdictionOf(request),
        });
    });
    app.post('/api/consent/withdraw', limit, async (request) => {
        const body = z
            .object({
            visitorId,
            policyVersion: z.string().min(4).max(32),
        })
            .parse(request.body);
        return withdrawConsent({
            visitorId: body.visitorId,
            policyVersion: body.policyVersion,
            jurisdiction: jurisdictionOf(request),
        });
    });
    app.post('/api/consent/notice', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
        const body = z
            .object({
            visitorId,
            policyVersion: z.string().min(4).max(32),
        })
            .parse(request.body);
        return recordNotice(body.visitorId, body.policyVersion);
    });
};
