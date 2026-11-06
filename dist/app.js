import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import { env, isProd, trustProxySetting } from './config.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import { adminArticlesRoutes } from './routes/admin/articles.js';
import { adminAuditRoutes } from './routes/admin/audit.js';
import { adminDashboardRoutes } from './routes/admin/dashboard.js';
import { adminGalleriesRoutes } from './routes/admin/galleries.js';
import { adminLiveRoutes } from './routes/admin/live.js';
import { adminMediaRoutes } from './routes/admin/media.js';
import { adminNotificationsRoutes } from './routes/admin/notifications.js';
import { adminRedirectsRoutes } from './routes/admin/redirects.js';
import { adminReportsRoutes } from './routes/admin/reports.js';
import { adminSessionRoutes } from './routes/admin/session.js';
import { adminSettingsRoutes } from './routes/admin/settings.js';
import { adminTaxonomyRoutes } from './routes/admin/taxonomy.js';
import { adminUsersRoutes } from './routes/admin/users.js';
import { adminVideosRoutes } from './routes/admin/videos.js';
import { adminCookiesRoutes } from './routes/admin/cookies.js';
import { healthRoutes } from './routes/health.js';
import { publicAnalyticsRoutes } from './routes/public/analytics.js';
import { publicConsentRoutes } from './routes/public/consent.js';
import { publicContentRoutes } from './routes/public/content.js';
import { publishDueScheduled } from './services/articles.js';
import { purgeOldSessions } from './services/analytics.js';
import { ensureCookieCatalog } from './services/cookie-catalog.js';
import { purgeExpiredConsents } from './services/consent.js';
import { closeCache } from './lib/cache.js';
export async function buildApp(options = {}) {
    const app = Fastify({
        logger: {
            level: isProd ? 'info' : 'debug',
        },
        trustProxy: trustProxySetting(),
    });
    await app.register(sensible);
    await app.register(errorHandlerPlugin);
    await app.register(compress, { global: true, threshold: 1024 });
    await app.register(cors, {
        origin(origin, callback) {
            if (!origin || env.corsOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Origin not allowed'), false);
        },
        credentials: true,
    });
    await app.register(cookie, {
        secret: env.SESSION_SECRET,
    });
    await app.register(multipart, {
        limits: {
            fileSize: 8 * 1024 * 1024,
            files: 1,
        },
    });
    await app.register(rateLimit, {
        global: true,
        max: 300,
        timeWindow: '1 minute',
    });
    app.addHook('onRequest', async (_request, reply) => {
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    });
    await app.register(authPlugin);
    await app.register(healthRoutes);
    await app.register(adminSessionRoutes);
    await app.register(adminDashboardRoutes);
    await app.register(adminArticlesRoutes);
    await app.register(adminMediaRoutes);
    await app.register(adminTaxonomyRoutes);
    await app.register(adminUsersRoutes);
    await app.register(adminLiveRoutes);
    await app.register(adminNotificationsRoutes);
    await app.register(adminAuditRoutes);
    await app.register(adminReportsRoutes);
    await app.register(adminVideosRoutes);
    await app.register(adminGalleriesRoutes);
    await app.register(adminSettingsRoutes);
    await app.register(adminRedirectsRoutes);
    await app.register(adminCookiesRoutes);
    await app.register(publicContentRoutes);
    await app.register(publicAnalyticsRoutes);
    await app.register(publicConsentRoutes);
    try {
        await ensureCookieCatalog();
    }
    catch (error) {
        app.log.error({ err: error }, 'Catálogo de cookies indisponível');
    }
    const runJobs = options.runJobs !== false;
    const purgeTimer = runJobs
        ? setInterval(() => {
            void purgeOldSessions().catch((error) => {
                app.log.error({ err: error }, 'Falha ao limpar sessões de analytics');
            });
            void purgeExpiredConsents().catch((error) => {
                app.log.error({ err: error }, 'Falha ao limpar consentimentos expirados');
            });
        }, 6 * 60 * 60_000)
        : null;
    purgeTimer?.unref();
    const timer = runJobs
        ? setInterval(() => {
            void publishDueScheduled().catch((error) => {
                app.log.error({ err: error }, 'Falha no agendador editorial');
            });
        }, 30_000)
        : null;
    timer?.unref();
    app.addHook('onClose', async () => {
        if (timer)
            clearInterval(timer);
        if (purgeTimer)
            clearInterval(purgeTimer);
        await closeCache();
    });
    return app;
}
