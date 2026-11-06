import { z } from 'zod';
import { env, isProd } from '../../config.js';
import { confirmPasswordReset, login, logout, requestPasswordReset } from '../../services/auth.js';
const loginBody = z.object({
    email: z.email(),
    password: z.string().min(1),
});
function setSessionCookie(reply, token, expiresAt) {
    reply.setCookie(env.SESSION_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        expires: expiresAt,
    });
}
export const adminSessionRoutes = async (app) => {
    app.post('/api/admin/session', {
        config: {
            rateLimit: {
                max: 20,
                timeWindow: '15 minutes',
            },
        },
    }, async (request, reply) => {
        const body = loginBody.parse(request.body);
        const result = await login({
            email: body.email,
            password: body.password,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
        });
        setSessionCookie(reply, result.token, result.expiresAt);
        return {
            user: result.user,
            expiresAt: result.expiresAt.toISOString(),
        };
    });
    app.get('/api/admin/session', { preHandler: [app.authenticate] }, async (request) => ({ user: request.user }));
    app.delete('/api/admin/session', async (request, reply) => {
        const token = request.cookies[env.SESSION_COOKIE_NAME];
        await logout(token, request.ip);
        reply.clearCookie(env.SESSION_COOKIE_NAME, { path: '/' });
        return { ok: true };
    });
    const resetLimit = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };
    app.post('/api/admin/password-reset', resetLimit, async (request) => {
        const body = z.object({ email: z.email() }).parse(request.body);
        return requestPasswordReset(body.email);
    });
    app.post('/api/admin/password-reset/confirm', resetLimit, async (request) => {
        const body = z
            .object({
            token: z.string().min(20).max(200),
            password: z.string().min(12).max(200),
        })
            .parse(request.body);
        return confirmPasswordReset(body.token, body.password);
    });
};
