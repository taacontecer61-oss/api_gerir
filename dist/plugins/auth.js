import fp from 'fastify-plugin';
import { env } from '../config.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { resolveSession } from '../services/auth.js';
const authPlugin = async (app) => {
    app.decorateRequest('user', null);
    app.addHook('preHandler', async (request) => {
        const token = request.cookies[env.SESSION_COOKIE_NAME];
        request.user = await resolveSession(token);
    });
    app.decorate('authenticate', async (request) => {
        if (!request.user) {
            throw unauthorized();
        }
    });
    app.decorate('requirePermission', (...needed) => {
        return async (request) => {
            if (!request.user) {
                throw unauthorized();
            }
            const hasAll = needed.every((permission) => request.user.permissions.includes(permission));
            if (!hasAll) {
                throw forbidden();
            }
        };
    });
};
export default fp(authPlugin, {
    name: 'auth-plugin',
    dependencies: ['@fastify/cookie'],
});
