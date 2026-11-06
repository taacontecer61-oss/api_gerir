import { env } from '../config.js'

type Entry = { value: string; expiresAt: number }

const memory = new Map<string, Entry>()
const MAX_KEYS = 500
const PUBLIC_PREFIX = 'pub:'

type RedisClient = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>
  scan(cursor: string, matchToken: 'MATCH', pattern: string, countToken: 'COUNT', count: number): Promise<[string, string[]]>
  del(...keys: string[]): Promise<unknown>
  quit(): Promise<unknown>
  on(event: 'error', listener: (error: Error) => void): void
}

let redis: RedisClient | null = null
let redisDisabled = false

async function client(): Promise<RedisClient | null> {
  if (!env.REDIS_URL || redisDisabled) return null
  if (redis) return redis
  try {
    const imported = await import('ioredis')
    const connection = new imported.Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
    }) as unknown as RedisClient
    connection.on('error', () => {
      redisDisabled = true
      redis = null
    })
    await (connection as unknown as { connect: () => Promise<void> }).connect()
    redis = connection
    return redis
  } catch {
    redisDisabled = true
    redis = null
    return null
  }
}

function remember(key: string, value: string, seconds: number) {
  if (memory.size >= MAX_KEYS) {
    const oldest = memory.keys().next().value
    if (oldest) memory.delete(oldest)
  }
  memory.set(key, { value, expiresAt: Date.now() + seconds * 1000 })
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const remote = await client()
  if (remote) {
    try {
      const raw = await remote.get(key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      redisDisabled = true
    }
  }
  const hit = memory.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    memory.delete(key)
    return null
  }
  return JSON.parse(hit.value) as T
}

export async function cacheSet(key: string, value: unknown, seconds: number) {
  const raw = JSON.stringify(value)
  remember(key, raw, seconds)
  const remote = await client()
  if (!remote) return
  try {
    await remote.set(key, raw, 'EX', seconds)
  } catch {
    redisDisabled = true
  }
}

export async function invalidatePublicContent() {
  for (const key of memory.keys()) {
    if (key.startsWith(PUBLIC_PREFIX)) memory.delete(key)
  }
  const remote = await client()
  if (!remote) return
  try {
    let cursor = '0'
    do {
      const [next, keys] = await remote.scan(cursor, 'MATCH', `${PUBLIC_PREFIX}*`, 'COUNT', 100)
      cursor = next
      if (keys.length) await remote.del(...keys)
    } while (cursor !== '0')
  } catch {
    redisDisabled = true
  }
}

export function publicCacheKey(url: string) {
  return `${PUBLIC_PREFIX}${url}`
}

export async function closeCache() {
  if (!redis) return
  await redis.quit().catch(() => undefined)
  redis = null
}
