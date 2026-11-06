import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, '../.env') });
function emptyToUndefined(value) {
    return value === '' ? undefined : value;
}
const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().positive().default(3306),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string().min(1),
    DATABASE_NAME: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    SESSION_COOKIE_NAME: z.string().default('kn_session'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
    CORS_ORIGIN: z.string().min(1),
    TIMEZONE: z.string().default('Africa/Luanda'),
    SEED_ADMIN_EMAIL: z.email(),
    SEED_ADMIN_PASSWORD: z.string().min(12),
    SEED_ADMIN_NAME: z.string().min(1),
    MEDIA_ROOT: z.string().optional(),
    /** URL pública do site (RSS, links absolutos). Por omissão, a primeira origem CORS. */
    SITE_URL: z.url().optional(),
    /** URL do painel. Usada na ligação de recuperação de palavra-passe. */
    ADMIN_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    /** false, true ou número de proxies de confiança. Vazio: 1 em produção, false em desenvolvimento. */
    TRUST_PROXY: z.preprocess(emptyToUndefined, z.string().optional()),
    DATABASE_POOL_SIZE: z.coerce.number().int().positive().max(100).default(10),
    REDIS_URL: z.preprocess(emptyToUndefined, z.string().optional()),
    CDN_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    WEB_CONCURRENCY: z.coerce.number().int().positive().max(16).default(1),
    SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    const details = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n');
    throw new Error(`Configuração inválida (.env):\n${details}`);
}
export const env = {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
    mediaRoot: parsed.data.MEDIA_ROOT ??
        resolve(root, '../storage/media'),
};
export const isProd = env.NODE_ENV === 'production';
export const siteUrl = (parsed.data.SITE_URL ??
    env.corsOrigins[0] ??
    'http://localhost:5173').replace(/\/+$/, '');
export const adminUrl = (env.ADMIN_URL ?? (isProd ? siteUrl : 'http://127.0.0.1:5174')).replace(/\/+$/, '');
/** Número de saltos de proxy em que o IP do cliente é de confiança. */
export function trustProxySetting() {
    const raw = env.TRUST_PROXY;
    const hops = raw == null ? (isProd ? 1 : 0) : raw === 'true' ? Number.POSITIVE_INFINITY : raw === 'false' ? 0 : Number(raw);
    if (!Number.isInteger(hops) && hops !== Number.POSITIVE_INFINITY)
        return isProd;
    if (hops === Number.POSITIVE_INFINITY)
        return true;
    if (hops <= 0)
        return false;
    return (_address, hop) => hop < hops;
}
export function mediaPublicUrl(path) {
    if (!env.CDN_BASE_URL)
        return path;
    return `${env.CDN_BASE_URL.replace(/\/+$/, '')}${path}`;
}
