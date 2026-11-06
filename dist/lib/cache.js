import { env } from '../config.js';
const memory = new Map();
const MAX_KEYS = 500;
const PUBLIC_PREFIX = 'pub:';
let redis = null;
let redisDisabled = false;
async function client() {
    if (!env.REDIS_URL || redisDisabled)
        return null;
    if (redis)
        return redis;
    try {
        const imported = await import('ioredis');
        const connection = new imported.Redis(env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 1000,
        });
        connection.on('error', () => {
            redisDisabled = true;
            redis = null;
        });
        await connection.connect();
        redis = connection;
        return redis;
    }
    catch {
        redisDisabled = true;
        redis = null;
        return null;
    }
}
function remember(key, value, seconds) {
    if (memory.size >= MAX_KEYS) {
        const oldest = memory.keys().next().value;
        if (oldest)
            memory.delete(oldest);
    }
    memory.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
}
export async function cacheGet(key) {
    const remote = await client();
    if (remote) {
        try {
            const raw = await remote.get(key);
            return raw ? JSON.parse(raw) : null;
        }
        catch {
            redisDisabled = true;
        }
    }
    const hit = memory.get(key);
    if (!hit)
        return null;
    if (hit.expiresAt <= Date.now()) {
        memory.delete(key);
        return null;
    }
    return JSON.parse(hit.value);
}
export async function cacheSet(key, value, seconds) {
    const raw = JSON.stringify(value);
    remember(key, raw, seconds);
    const remote = await client();
    if (!remote)
        return;
    try {
        await remote.set(key, raw, 'EX', seconds);
    }
    catch {
        redisDisabled = true;
    }
}
export async function invalidatePublicContent() {
    for (const key of memory.keys()) {
        if (key.startsWith(PUBLIC_PREFIX))
            memory.delete(key);
    }
    const remote = await client();
    if (!remote)
        return;
    try {
        let cursor = '0';
        do {
            const [next, keys] = await remote.scan(cursor, 'MATCH', `${PUBLIC_PREFIX}*`, 'COUNT', 100);
            cursor = next;
            if (keys.length)
                await remote.del(...keys);
        } while (cursor !== '0');
    }
    catch {
        redisDisabled = true;
    }
}
export function publicCacheKey(url) {
    return `${PUBLIC_PREFIX}${url}`;
}
export async function closeCache() {
    if (!redis)
        return;
    await redis.quit().catch(() => undefined);
    redis = null;
}
