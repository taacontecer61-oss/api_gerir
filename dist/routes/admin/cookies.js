import { z } from 'zod';
import { PERMISSIONS } from '../../lib/permissions.js';
import { COOKIE_TYPES, INTEGRATION_TYPES } from '../../lib/consent-rules.js';
import { createIntegration, createInventoryItem, listCategories, listIntegrations, listInventory, listPolicyVersions, publishPolicyVersion, updateCategory, updateIntegration, updateInventoryItem, } from '../../services/cookie-catalog.js';
import { getConsentStats } from '../../services/cookie-stats.js';
const text = (min, max) => z.string().trim().min(min).max(max);
export const adminCookiesRoutes = async (app) => {
    const guard = [app.authenticate, app.requirePermission(PERMISSIONS.SETTINGS_MANAGE)];
    app.get('/api/admin/cookies/categories', { preHandler: guard }, async () => ({
        categories: await listCategories(),
    }));
    app.patch('/api/admin/cookies/categories/:id', { preHandler: guard }, async (request) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const body = z
            .object({
            description: text(10, 2000).optional(),
            purpose: text(10, 2000).optional(),
            examples: text(1, 2000).optional(),
            isActive: z.boolean().optional(),
        })
            .parse(request.body);
        return updateCategory(request.user, id, body, request.ip);
    });
    app.get('/api/admin/cookies/inventory', { preHandler: guard }, async () => ({
        inventory: await listInventory(),
    }));
    app.post('/api/admin/cookies/inventory', { preHandler: guard }, async (request) => {
        const body = z
            .object({
            categoryId: z.string().uuid(),
            cookieName: text(1, 120),
            provider: text(2, 120),
            purpose: text(10, 500),
            duration: text(1, 120),
            domain: text(1, 191),
            cookieType: z.enum(COOKIE_TYPES),
            requiresConsent: z.boolean(),
            isActive: z.boolean(),
            usedOn: text(2, 255),
            gateKey: z.string().trim().max(64).nullable().optional(),
        })
            .parse(request.body);
        return createInventoryItem(request.user, body, request.ip);
    });
    app.patch('/api/admin/cookies/inventory/:id', { preHandler: guard }, async (request) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const body = z
            .object({
            categoryId: z.string().uuid().optional(),
            cookieName: text(1, 120).optional(),
            provider: text(2, 120).optional(),
            purpose: text(10, 500).optional(),
            duration: text(1, 120).optional(),
            domain: text(1, 191).optional(),
            cookieType: z.enum(COOKIE_TYPES).optional(),
            requiresConsent: z.boolean().optional(),
            isActive: z.boolean().optional(),
            usedOn: text(2, 255).optional(),
            gateKey: z.string().trim().max(64).nullable().optional(),
        })
            .parse(request.body);
        return updateInventoryItem(request.user, id, body, request.ip);
    });
    app.get('/api/admin/cookies/integrations', { preHandler: guard }, async () => ({
        integrations: await listIntegrations(),
    }));
    app.post('/api/admin/cookies/integrations', { preHandler: guard }, async (request) => {
        const body = z
            .object({
            name: text(3, 120),
            categoryId: z.string().uuid(),
            integrationType: z.enum(INTEGRATION_TYPES),
            publicId: z.string().trim().max(64).default(''),
            purpose: text(10, 500),
            isActive: z.boolean(),
        })
            .parse(request.body);
        return createIntegration(request.user, body, request.ip);
    });
    app.patch('/api/admin/cookies/integrations/:id', { preHandler: guard }, async (request) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const body = z
            .object({
            name: text(3, 120).optional(),
            categoryId: z.string().uuid().optional(),
            publicId: z.string().trim().max(64).optional(),
            purpose: text(10, 500).optional(),
            isActive: z.boolean().optional(),
        })
            .parse(request.body);
        return updateIntegration(request.user, id, body, request.ip);
    });
    app.get('/api/admin/cookies/policies', { preHandler: guard }, async () => ({
        policies: await listPolicyVersions(),
    }));
    app.post('/api/admin/cookies/policies', { preHandler: guard }, async (request) => {
        const body = z
            .object({
            version: z.string().trim().min(6).max(32),
            title: text(3, 160),
            content: text(50, 20000),
            changeSummary: text(5, 500),
            requiresReconsent: z.boolean(),
        })
            .parse(request.body);
        return publishPolicyVersion(request.user, body, request.ip);
    });
    app.get('/api/admin/cookies/stats', { preHandler: guard }, async (request) => {
        const query = z
            .object({
            from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
            .parse(request.query);
        return getConsentStats(query.from, query.to);
    });
};
