import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  articles,
  galleries,
  liveCoverages,
  pageViewCountries,
  pageViewDaily,
  pageViewSessions,
  users,
  videos,
} from '../db/schema/index.js'
import { env } from '../config.js'
import { badRequest } from '../lib/errors.js'
import { countryDisplayName } from '../lib/geo.js'
import { newId } from '../lib/ids.js'

export const VIEW_ENTITY_TYPES = ['article', 'live_coverage', 'video', 'gallery'] as const
export type ViewEntityType = (typeof VIEW_ENTITY_TYPES)[number]

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SESSION_HASH_PATTERN = /^[a-f0-9]{16,64}$/

export function luandaDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

/** Primeiro e último dia do mês civil actual no fuso da plataforma (ex.: África/Luanda). */
export function currentMonthRange(date: Date = new Date()) {
  const to = luandaDay(date)
  return { from: `${to.slice(0, 7)}-01`, to }
}

function assertDay(value: string, label: string) {
  if (!DAY_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw badRequest('INVALID_DATE', `Data «${label}» inválida. Use AAAA-MM-DD.`)
  }
}

async function entityIsPublic(entityType: ViewEntityType, entityId: string) {
  if (entityType === 'article') {
    const [row] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.id, entityId), eq(articles.status, 'published'), isNull(articles.deletedAt)))
      .limit(1)
    return Boolean(row)
  }
  if (entityType === 'live_coverage') {
    const [row] = await db
      .select({ id: liveCoverages.id })
      .from(liveCoverages)
      .where(
        and(
          eq(liveCoverages.id, entityId),
          isNull(liveCoverages.deletedAt),
          inArray(liveCoverages.status, ['scheduled', 'live', 'paused', 'ended']),
        ),
      )
      .limit(1)
    return Boolean(row)
  }
  if (entityType === 'video') {
    const [row] = await db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.id, entityId), eq(videos.isPublished, true)))
      .limit(1)
    return Boolean(row)
  }
  const [row] = await db
    .select({ id: galleries.id })
    .from(galleries)
    .where(and(eq(galleries.id, entityId), eq(galleries.isPublished, true)))
    .limit(1)
  return Boolean(row)
}

export async function recordPageView(input: {
  entityType: ViewEntityType
  entityId: string
  sessionHash: string
  /** ISO 3166-1 alpha-2; «XX» se desconhecido. */
  countryCode?: string
}) {
  if (!VIEW_ENTITY_TYPES.includes(input.entityType)) {
    throw badRequest('INVALID_ENTITY_TYPE', 'Tipo de conteúdo inválido.')
  }
  if (!SESSION_HASH_PATTERN.test(input.sessionHash)) {
    throw badRequest('INVALID_SESSION', 'Sessão inválida.')
  }
  if (!(await entityIsPublic(input.entityType, input.entityId))) {
    return { recorded: false }
  }

  const day = luandaDay()
  const countryCode = /^[A-Z]{2}$/.test(input.countryCode ?? '')
    ? (input.countryCode as string)
    : 'XX'

  const [inserted] = await db
    .insert(pageViewSessions)
    .ignore()
    .values({
      id: newId(),
      sessionHash: input.sessionHash,
      entityType: input.entityType,
      entityId: input.entityId,
      day,
    })
  const isNewSession = inserted.affectedRows > 0

  await db
    .insert(pageViewDaily)
    .values({
      id: newId(),
      entityType: input.entityType,
      entityId: input.entityId,
      day,
      views: 1,
      uniqueSessions: isNewSession ? 1 : 0,
    })
    .onDuplicateKeyUpdate({
      set: {
        views: sql`${pageViewDaily.views} + 1`,
        uniqueSessions: isNewSession
          ? sql`${pageViewDaily.uniqueSessions} + 1`
          : sql`${pageViewDaily.uniqueSessions}`,
      },
    })

  await db
    .insert(pageViewCountries)
    .values({
      id: newId(),
      countryCode,
      day,
      views: 1,
    })
    .onDuplicateKeyUpdate({
      set: {
        views: sql`${pageViewCountries.views} + 1`,
      },
    })

  return { recorded: true, day, countryCode }
}

export async function purgeOldSessions(keepDays = 2) {
  const cutoff = shiftDay(luandaDay(), -keepDays)
  await db.delete(pageViewSessions).where(lt(pageViewSessions.day, cutoff))
}

export async function getViewsSeries(
  entityType: ViewEntityType | undefined,
  from: string,
  to: string,
) {
  assertDay(from, 'from')
  assertDay(to, 'to')
  if (from > to) throw badRequest('INVALID_RANGE', 'O intervalo de datas é inválido.')
  if (entityType && !VIEW_ENTITY_TYPES.includes(entityType)) {
    throw badRequest('INVALID_ENTITY_TYPE', 'Tipo de conteúdo inválido.')
  }

  const filters = [gte(pageViewDaily.day, from), lte(pageViewDaily.day, to)]
  if (entityType) filters.push(eq(pageViewDaily.entityType, entityType))

  const rows = await db
    .select({
      day: pageViewDaily.day,
      views: sql<number>`SUM(${pageViewDaily.views})`,
      uniqueSessions: sql<number>`SUM(${pageViewDaily.uniqueSessions})`,
    })
    .from(pageViewDaily)
    .where(and(...filters))
    .groupBy(pageViewDaily.day)
    .orderBy(asc(pageViewDaily.day))

  const byDay = new Map(rows.map((row) => [row.day, row]))
  const series: { day: string; views: number; uniqueSessions: number }[] = []
  for (let day = from, guard = 0; day <= to && guard < 400; day = shiftDay(day, 1), guard += 1) {
    const row = byDay.get(day)
    series.push({
      day,
      views: Number(row?.views ?? 0),
      uniqueSessions: Number(row?.uniqueSessions ?? 0),
    })
  }
  return series
}

export async function getTopContent(from: string, to: string, limit = 10, entityType?: ViewEntityType) {
  assertDay(from, 'from')
  assertDay(to, 'to')
  if (from > to) throw badRequest('INVALID_RANGE', 'O intervalo de datas é inválido.')
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50)

  const filters = [gte(pageViewDaily.day, from), lte(pageViewDaily.day, to)]
  if (entityType) filters.push(eq(pageViewDaily.entityType, entityType))

  const rows = await db
    .select({
      entityType: pageViewDaily.entityType,
      entityId: pageViewDaily.entityId,
      views: sql<number>`SUM(${pageViewDaily.views})`,
      uniqueSessions: sql<number>`SUM(${pageViewDaily.uniqueSessions})`,
    })
    .from(pageViewDaily)
    .where(and(...filters))
    .groupBy(pageViewDaily.entityType, pageViewDaily.entityId)
    .orderBy(desc(sql`SUM(${pageViewDaily.views})`))
    .limit(safeLimit)

  const idsOf = (type: ViewEntityType) =>
    rows.filter((row) => row.entityType === type).map((row) => row.entityId)

  const titles = new Map<string, { title: string; slug: string }>()

  const articleIds = idsOf('article')
  if (articleIds.length) {
    const found = await db
      .select({ id: articles.id, title: articles.title, slug: articles.slug })
      .from(articles)
      .where(inArray(articles.id, articleIds))
    found.forEach((item) => titles.set(`article:${item.id}`, item))
  }
  const liveIds = idsOf('live_coverage')
  if (liveIds.length) {
    const found = await db
      .select({ id: liveCoverages.id, title: liveCoverages.title, slug: liveCoverages.slug })
      .from(liveCoverages)
      .where(inArray(liveCoverages.id, liveIds))
    found.forEach((item) => titles.set(`live_coverage:${item.id}`, item))
  }
  const videoIds = idsOf('video')
  if (videoIds.length) {
    const found = await db
      .select({ id: videos.id, title: videos.title, slug: videos.slug })
      .from(videos)
      .where(inArray(videos.id, videoIds))
    found.forEach((item) => titles.set(`video:${item.id}`, item))
  }
  const galleryIds = idsOf('gallery')
  if (galleryIds.length) {
    const found = await db
      .select({ id: galleries.id, title: galleries.title, slug: galleries.slug })
      .from(galleries)
      .where(inArray(galleries.id, galleryIds))
    found.forEach((item) => titles.set(`gallery:${item.id}`, item))
  }

  return rows.map((row) => {
    const info = titles.get(`${row.entityType}:${row.entityId}`)
    return {
      entityType: row.entityType,
      entityId: row.entityId,
      title: info?.title ?? null,
      slug: info?.slug ?? null,
      views: Number(row.views),
      uniqueSessions: Number(row.uniqueSessions),
    }
  })
}

export async function getTotalViews(from: string, to: string) {
  const [row] = await db
    .select({ views: sql<number>`COALESCE(SUM(${pageViewDaily.views}), 0)` })
    .from(pageViewDaily)
    .where(and(gte(pageViewDaily.day, from), lte(pageViewDaily.day, to)))
  return Number(row?.views ?? 0)
}

export type CountryViewsRow = {
  countryCode: string
  countryName: string
  views: number
  rank: number
}

/** Países com mais visualizações no intervalo (agregados diários, sem PII). */
export async function getTopCountriesByViews(
  from: string,
  to: string,
  limit = 15,
): Promise<CountryViewsRow[]> {
  assertDay(from, 'from')
  assertDay(to, 'to')
  if (from > to) throw badRequest('INVALID_RANGE', 'O intervalo de datas é inválido.')
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50)

  const rows = await db
    .select({
      countryCode: pageViewCountries.countryCode,
      views: sql<number>`SUM(${pageViewCountries.views})`,
    })
    .from(pageViewCountries)
    .where(and(gte(pageViewCountries.day, from), lte(pageViewCountries.day, to)))
    .groupBy(pageViewCountries.countryCode)
    .orderBy(desc(sql`SUM(${pageViewCountries.views})`))
    .limit(safeLimit)

  return rows.map((row, index) => ({
    countryCode: row.countryCode,
    countryName: countryDisplayName(row.countryCode),
    views: Number(row.views ?? 0),
    rank: index + 1,
  }))
}

export type TopArticleViewsRow = {
  id: string
  title: string
  slug: string
  authorName: string
  publishedAt: Date | null
  views: number
  rank: number
}

/**
 * Ranking de artigos por visualizações reais no intervalo.
 * Se `authorUserId` for indicado, restringe aos artigos desse autor (privacidade).
 * Com `includeZeroViews`, inclui artigos publicados sem visualizações no período.
 */
export async function getTopArticlesByViews(options: {
  from: string
  to: string
  limit?: number
  authorUserId?: string
  includeZeroViews?: boolean
}): Promise<TopArticleViewsRow[]> {
  assertDay(options.from, 'from')
  assertDay(options.to, 'to')
  if (options.from > options.to) throw badRequest('INVALID_RANGE', 'O intervalo de datas é inválido.')
  const safeLimit = Math.min(Math.max(1, Math.floor(options.limit ?? 10)), 50)

  const authorLabel = sql<string>`COALESCE(MAX(${users.name}), MAX(NULLIF(${articles.authorName}, '')), 'Redacção')`

  if (options.includeZeroViews && options.authorUserId) {
    const rows = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        authorName: authorLabel,
        publishedAt: articles.publishedAt,
        views: sql<number>`COALESCE(SUM(${pageViewDaily.views}), 0)`,
      })
      .from(articles)
      .leftJoin(users, eq(articles.authorUserId, users.id))
      .leftJoin(
        pageViewDaily,
        and(
          eq(pageViewDaily.entityId, articles.id),
          eq(pageViewDaily.entityType, 'article'),
          gte(pageViewDaily.day, options.from),
          lte(pageViewDaily.day, options.to),
        ),
      )
      .where(
        and(
          eq(articles.authorUserId, options.authorUserId),
          eq(articles.status, 'published'),
          isNull(articles.deletedAt),
        ),
      )
      .groupBy(articles.id)
      .orderBy(desc(sql`COALESCE(SUM(${pageViewDaily.views}), 0)`), desc(articles.publishedAt))
      .limit(safeLimit)

    return rows.map((row, index) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      authorName: row.authorName,
      publishedAt: row.publishedAt,
      views: Number(row.views ?? 0),
      rank: index + 1,
    }))
  }

  const filters = [
    eq(pageViewDaily.entityType, 'article'),
    gte(pageViewDaily.day, options.from),
    lte(pageViewDaily.day, options.to),
    isNull(articles.deletedAt),
  ]
  if (options.authorUserId) {
    filters.push(eq(articles.authorUserId, options.authorUserId))
  }

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      authorName: authorLabel,
      publishedAt: articles.publishedAt,
      views: sql<number>`SUM(${pageViewDaily.views})`,
    })
    .from(pageViewDaily)
    .innerJoin(articles, eq(pageViewDaily.entityId, articles.id))
    .leftJoin(users, eq(articles.authorUserId, users.id))
    .where(and(...filters))
    .groupBy(articles.id)
    .orderBy(desc(sql`SUM(${pageViewDaily.views})`))
    .limit(safeLimit)

  return rows.map((row, index) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    authorName: row.authorName,
    publishedAt: row.publishedAt,
    views: Number(row.views ?? 0),
    rank: index + 1,
  }))
}
