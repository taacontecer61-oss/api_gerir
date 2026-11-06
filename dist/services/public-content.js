import { and, asc, count, desc, eq, gte, inArray, isNull, like, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { db } from '../db/index.js';
import { articleGalleryItems, articleRelations, articleSecondaryCategories, articleTags, articles, categories, galleries, galleryPhotos, liveCoverageUpdates, liveCoverages, mediaAssets, pageViewDaily, tags, trendingTopics, users, videos, } from '../db/schema/index.js';
import { mediaPublicUrl } from '../config.js';
import { booleanFulltext } from '../lib/search-text.js';
import { badRequest, notFound } from '../lib/errors.js';
import { paginateMeta } from '../lib/pagination.js';
import { luandaDay, shiftDay } from './analytics.js';
const RECENT_ENDED_HOURS = 72;
const publicAuthor = alias(users, 'public_author');
const publicLiveAuthor = alias(users, 'public_live_author');
const publicAuthorName = sql `COALESCE(${publicAuthor.name}, NULLIF(${articles.authorName}, ''), 'Redacção')`;
function publishedMediaUrl(url) {
    if (!url?.startsWith('/media/'))
        return url;
    return mediaPublicUrl(url);
}
function mediaUrls(mediaId) {
    return {
        coverUrl: mediaId ? mediaPublicUrl(`/media/${mediaId}/original`) : null,
        coverThumbUrl: mediaId ? mediaPublicUrl(`/media/${mediaId}/thumb`) : null,
        coverCardUrl: mediaId ? mediaPublicUrl(`/media/${mediaId}/card`) : null,
        coverHeroUrl: mediaId ? mediaPublicUrl(`/media/${mediaId}/hero`) : null,
    };
}
function likePattern(q) {
    return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
function publishedArticleFilters() {
    return [
        eq(articles.status, 'published'),
        isNull(articles.deletedAt),
        lte(articles.publishedAt, new Date()),
        eq(categories.isActive, true),
    ];
}
const articleCardColumns = {
    id: articles.id,
    slug: articles.slug,
    title: articles.title,
    subtitle: articles.subtitle,
    summary: articles.summary,
    publishedAt: articles.publishedAt,
    readingTimeMinutes: articles.readingTimeMinutes,
    featured: articles.featured,
    highlight: articles.highlight,
    coverMediaId: articles.coverMediaId,
    coverAlt: articles.coverAlt,
    categorySlug: categories.slug,
    categoryName: categories.name,
    authorSlug: sql `COALESCE(${articles.authorUserId}, '')`,
    authorName: publicAuthorName,
    authorRole: sql `''`,
};
function presentArticleCard(row) {
    const { coverMediaId, ...rest } = row;
    return { ...rest, ...mediaUrls(coverMediaId) };
}
async function queryArticleCards(where, limit, offset = 0) {
    const rows = await db
        .select(articleCardColumns)
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(publicAuthor, eq(articles.authorUserId, publicAuthor.id))
        .where(where)
        .orderBy(desc(articles.publishedAt))
        .limit(limit)
        .offset(offset);
    return rows.map(presentArticleCard);
}
export async function listPublishedArticles(input = {}) {
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 12, 50);
    const filters = publishedArticleFilters();
    if (input.categorySlug)
        filters.push(eq(categories.slug, input.categorySlug));
    if (input.featured !== undefined)
        filters.push(eq(articles.featured, input.featured));
    if (input.highlight !== undefined)
        filters.push(eq(articles.highlight, input.highlight));
    if (input.respectNoindex)
        filters.push(eq(articles.noindex, false));
    if (input.excludeId)
        filters.push(sql `${articles.id} <> ${input.excludeId}`);
    if (input.tagSlug) {
        filters.push(inArray(articles.id, db
            .select({ id: articleTags.articleId })
            .from(articleTags)
            .innerJoin(tags, eq(articleTags.tagId, tags.id))
            .where(eq(tags.slug, input.tagSlug))));
    }
    if (input.publishedFrom)
        filters.push(gte(articles.publishedAt, input.publishedFrom));
    if (input.publishedTo)
        filters.push(sql `${articles.publishedAt} < ${input.publishedTo}`);
    if (input.q) {
        const pattern = likePattern(input.q);
        filters.push(or(like(articles.title, pattern), like(articles.summary, pattern), like(articles.subtitle, pattern)));
    }
    const where = and(...filters);
    const [totalRow] = await db
        .select({ total: count() })
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .where(where);
    const meta = paginateMeta(Number(totalRow.total), page, pageSize);
    const items = await queryArticleCards(where, meta.pageSize, (meta.page - 1) * meta.pageSize);
    return { items, ...meta };
}
export async function getPublishedArticleBySlug(slug) {
    const [row] = await db
        .select({
        ...articleCardColumns,
        contentHtml: articles.contentHtml,
        coverCaption: articles.coverCaption,
        seoTitle: articles.seoTitle,
        seoDescription: articles.seoDescription,
        noindex: articles.noindex,
        credits: articles.credits,
        sources: articles.sources,
        location: articles.location,
        ogImageMediaId: articles.ogImageMediaId,
        categoryId: articles.categoryId,
        updatedAt: articles.updatedAt,
        authorBio: sql `NULL`,
    })
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(publicAuthor, eq(articles.authorUserId, publicAuthor.id))
        .where(and(...publishedArticleFilters(), eq(articles.slug, slug)))
        .limit(1);
    if (!row)
        throw notFound('Artigo não encontrado.');
    const tagRows = await db
        .select({ name: tags.name, slug: tags.slug })
        .from(articleTags)
        .innerJoin(tags, eq(articleTags.tagId, tags.id))
        .where(eq(articleTags.articleId, row.id));
    const secondaryCategories = await db
        .select({ slug: categories.slug, name: categories.name })
        .from(articleSecondaryCategories)
        .innerJoin(categories, eq(articleSecondaryCategories.categoryId, categories.id))
        .where(and(eq(articleSecondaryCategories.articleId, row.id), eq(categories.isActive, true)))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
    const galleryRows = await db
        .select({
        id: articleGalleryItems.id,
        mediaId: articleGalleryItems.mediaId,
        caption: articleGalleryItems.caption,
        alt: mediaAssets.altText,
        credit: mediaAssets.credit,
        width: mediaAssets.width,
        height: mediaAssets.height,
    })
        .from(articleGalleryItems)
        .innerJoin(mediaAssets, eq(articleGalleryItems.mediaId, mediaAssets.id))
        .where(eq(articleGalleryItems.articleId, row.id))
        .orderBy(asc(articleGalleryItems.sortOrder));
    const gallery = galleryRows.map(({ mediaId, ...item }) => ({
        ...item,
        url: mediaPublicUrl(`/media/${mediaId}/original`),
        thumbUrl: mediaPublicUrl(`/media/${mediaId}/thumb`),
    }));
    // Relacionados editoriais (article_relations) com fallback para a mesma categoria.
    const relationRows = await db
        .select({ relatedId: articleRelations.relatedArticleId, sortOrder: articleRelations.sortOrder })
        .from(articleRelations)
        .where(eq(articleRelations.articleId, row.id))
        .orderBy(asc(articleRelations.sortOrder));
    let related = [];
    if (relationRows.length) {
        const rank = new Map(relationRows.map((item, index) => [item.relatedId, index]));
        const cards = await queryArticleCards(and(...publishedArticleFilters(), inArray(articles.id, relationRows.map((item) => item.relatedId)), sql `${articles.id} <> ${row.id}`), relationRows.length);
        related = cards.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)).slice(0, 4);
    }
    if (!related.length) {
        related = await queryArticleCards(and(...publishedArticleFilters(), eq(articles.categoryId, row.categoryId), sql `${articles.id} <> ${row.id}`), 4);
    }
    const { categoryId: _categoryId, ogImageMediaId, ...article } = row;
    return {
        ...presentArticleCard(article),
        ogImageUrl: ogImageMediaId ? mediaPublicUrl(`/media/${ogImageMediaId}/original`) : null,
        tags: tagRows,
        secondaryCategories,
        gallery,
        related,
    };
}
const RSS_LIMIT = 30;
/** Últimos artigos publicados e indexáveis para o feed RSS. */
export async function getRssFeedItems() {
    const rows = await db
        .select({
        slug: articles.slug,
        title: articles.title,
        summary: articles.summary,
        publishedAt: articles.publishedAt,
        categoryName: categories.name,
        authorName: publicAuthorName,
        coverMediaId: articles.coverMediaId,
    })
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(publicAuthor, eq(articles.authorUserId, publicAuthor.id))
        .where(and(...publishedArticleFilters(), eq(articles.noindex, false)))
        .orderBy(desc(articles.publishedAt))
        .limit(RSS_LIMIT);
    return rows;
}
export async function listCategories() {
    const rows = await db
        .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        seoTitle: categories.seoTitle,
        seoDescription: categories.seoDescription,
        sortOrder: categories.sortOrder,
    })
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
    const counts = await db
        .select({ categoryId: articles.categoryId, total: count() })
        .from(articles)
        .where(and(eq(articles.status, 'published'), isNull(articles.deletedAt), lte(articles.publishedAt, new Date())))
        .groupBy(articles.categoryId);
    const byCategory = new Map(counts.map((item) => [item.categoryId, Number(item.total)]));
    return rows.map((row) => ({ ...row, articleCount: byCategory.get(row.id) ?? 0 }));
}
export async function searchPublished(input) {
    const q = input.q.trim().slice(0, 100);
    if (q.length < 2)
        throw badRequest('QUERY_TOO_SHORT', 'Indique pelo menos 2 caracteres.');
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 12, 50);
    const pattern = likePattern(q);
    const prefixPattern = `${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const fulltext = booleanFulltext(q);
    const tagMatches = db
        .select({ id: articleTags.articleId })
        .from(articleTags)
        .innerJoin(tags, eq(articleTags.tagId, tags.id))
        .where(like(tags.name, pattern));
    const textMatch = fulltext
        ? sql `MATCH(${articles.title}, ${articles.subtitle}, ${articles.summary}) AGAINST (${fulltext} IN BOOLEAN MODE)`
        : or(like(articles.title, pattern), like(articles.summary, pattern), like(articles.subtitle, pattern));
    const matchFilter = or(textMatch, like(articles.title, pattern), like(categories.name, pattern), inArray(articles.id, tagMatches));
    const where = and(...publishedArticleFilters(), matchFilter);
    const score = fulltext
        ? sql `MATCH(${articles.title}, ${articles.subtitle}, ${articles.summary}) AGAINST (${fulltext} IN BOOLEAN MODE)`
        : sql `CAST(0 AS SIGNED)`;
    /** Prioridade: pontuação do índice, depois título exacto, prefixo e data. */
    const relevance = sql `CASE
    WHEN ${articles.title} LIKE ${q} THEN 0
    WHEN ${articles.title} LIKE ${prefixPattern} THEN 1
    WHEN ${articles.title} LIKE ${pattern} THEN 2
    WHEN ${categories.name} LIKE ${pattern} THEN 3
    ELSE 4
  END`;
    const [totalRow] = await db
        .select({ total: count() })
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .where(where);
    const meta = paginateMeta(Number(totalRow.total), page, pageSize);
    const rows = await db
        .select(articleCardColumns)
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(publicAuthor, eq(articles.authorUserId, publicAuthor.id))
        .where(where)
        .orderBy(desc(score), asc(relevance), desc(articles.publishedAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return { query: q, items: rows.map(presentArticleCard), ...meta };
}
/**
 * Artigo publicado mais recente de cada categoria (categoria principal),
 * sem repetir categorias nem o mesmo artigo na grelha.
 */
export async function listLatestArticlePerCategory() {
    const result = await db.execute(sql `
    SELECT a.id AS id
    FROM articles a
    INNER JOIN categories c ON c.id = a.category_id AND c.is_active = 1
    INNER JOIN (
      SELECT a2.category_id AS category_id, MAX(a2.published_at) AS published_at
      FROM articles a2
      WHERE a2.status = 'published'
        AND a2.deleted_at IS NULL
        AND a2.published_at <= UTC_TIMESTAMP(3)
      GROUP BY a2.category_id
    ) latest ON latest.category_id = a.category_id AND latest.published_at = a.published_at
    WHERE a.status = 'published'
      AND a.deleted_at IS NULL
      AND a.published_at <= UTC_TIMESTAMP(3)
  `);
    const packets = Array.isArray(result) && Array.isArray(result[0])
        ? result[0]
        : result;
    const ids = [...new Set(packets.map((row) => row.id).filter((id) => Boolean(id)))];
    if (!ids.length)
        return [];
    const items = await queryArticleCards(and(...publishedArticleFilters(), inArray(articles.id, ids)), ids.length);
    const seenArticles = new Set();
    const seenCategories = new Set();
    const selected = [];
    for (const item of items) {
        if (seenArticles.has(item.id) || seenCategories.has(item.categorySlug))
            continue;
        seenArticles.add(item.id);
        seenCategories.add(item.categorySlug);
        selected.push(item);
    }
    return selected;
}
export async function getFeaturedContent(limit = 8) {
    const featuredLimit = Math.min(Math.max(limit, 1), 8);
    const secondaryLimit = Math.min(3, featuredLimit);
    const [featured, secondary, latest, categoryHighlights] = await Promise.all([
        listPublishedArticles({ featured: true, pageSize: featuredLimit }),
        listPublishedArticles({ highlight: true, pageSize: secondaryLimit }),
        listPublishedArticles({ pageSize: Math.max(featuredLimit, 12) }),
        listLatestArticlePerCategory(),
    ]);
    return {
        featured: featured.items,
        /** Notícias secundárias da homepage (flag `highlight`). */
        highlights: secondary.items,
        latest: latest.items,
        /** Grelha «Destaques»: até 4, um por categoria (o mais recente). */
        categoryHighlights: categoryHighlights.slice(0, 4),
    };
}
function liveCardColumns() {
    return {
        id: liveCoverages.id,
        slug: liveCoverages.slug,
        title: liveCoverages.title,
        summary: liveCoverages.summary,
        status: liveCoverages.status,
        featured: liveCoverages.featured,
        coverMediaId: liveCoverages.coverMediaId,
        coverAlt: liveCoverages.coverAlt,
        streamProvider: liveCoverages.streamProvider,
        scheduledStartAt: liveCoverages.scheduledStartAt,
        startedAt: liveCoverages.startedAt,
        endedAt: liveCoverages.endedAt,
        lastUpdateAt: liveCoverages.lastUpdateAt,
        categorySlug: categories.slug,
        categoryName: categories.name,
    };
}
export async function listActiveLiveCoverages(opts) {
    const limit = Math.min(opts?.limit ?? 10, 30);
    const recentCutoff = new Date(Date.now() - RECENT_ENDED_HOURS * 3_600_000);
    const statusFilters = [
        eq(liveCoverages.status, 'live'),
        eq(liveCoverages.status, 'paused'),
        and(eq(liveCoverages.status, 'ended'), gte(liveCoverages.endedAt, recentCutoff)),
    ];
    if (opts?.includeScheduled)
        statusFilters.push(eq(liveCoverages.status, 'scheduled'));
    const rows = await db
        .select({
        ...liveCardColumns(),
        authorName: sql `COALESCE(${publicLiveAuthor.name}, NULLIF(${liveCoverages.authorName}, ''), 'Redacção')`,
    })
        .from(liveCoverages)
        .innerJoin(categories, eq(liveCoverages.categoryId, categories.id))
        .leftJoin(publicLiveAuthor, eq(liveCoverages.authorUserId, publicLiveAuthor.id))
        .where(and(isNull(liveCoverages.deletedAt), or(...statusFilters)))
        .orderBy(sql `FIELD(${liveCoverages.status}, 'live', 'paused', 'scheduled', 'ended')`, desc(liveCoverages.lastUpdateAt))
        .limit(limit);
    return rows.map(({ coverMediaId, ...row }) => ({ ...row, ...mediaUrls(coverMediaId) }));
}
function presentLiveUpdate(row) {
    const { mediaId, ...rest } = row;
    return {
        ...rest,
        mediaUrl: mediaId ? mediaPublicUrl(`/media/${mediaId}/original`) : null,
        mediaThumbUrl: mediaId ? mediaPublicUrl(`/media/${mediaId}/thumb`) : null,
    };
}
const liveUpdateColumns = {
    id: liveCoverageUpdates.id,
    title: liveCoverageUpdates.title,
    bodyHtml: liveCoverageUpdates.bodyHtml,
    eventAt: liveCoverageUpdates.eventAt,
    isImportant: liveCoverageUpdates.isImportant,
    sourceUrl: liveCoverageUpdates.sourceUrl,
    mediaId: liveCoverageUpdates.mediaId,
    mediaCaption: liveCoverageUpdates.mediaCaption,
    publishedAt: liveCoverageUpdates.publishedAt,
};
export async function getLiveBySlug(slug, opts) {
    const limit = Math.min(opts?.limit ?? 100, 200);
    const [row] = await db
        .select({
        ...liveCardColumns(),
        descriptionHtml: liveCoverages.descriptionHtml,
        seoTitle: liveCoverages.seoTitle,
        seoDescription: liveCoverages.seoDescription,
        noindex: liveCoverages.noindex,
        streamEmbedUrl: liveCoverages.streamEmbedUrl,
        streamStatus: liveCoverages.streamStatus,
        authorSlug: sql `COALESCE(${liveCoverages.authorUserId}, '')`,
        authorName: sql `COALESCE(${publicLiveAuthor.name}, NULLIF(${liveCoverages.authorName}, ''), 'Redacção')`,
    })
        .from(liveCoverages)
        .innerJoin(categories, eq(liveCoverages.categoryId, categories.id))
        .leftJoin(publicLiveAuthor, eq(liveCoverages.authorUserId, publicLiveAuthor.id))
        .where(and(eq(liveCoverages.slug, slug), isNull(liveCoverages.deletedAt), inArray(liveCoverages.status, ['scheduled', 'live', 'paused', 'ended'])))
        .limit(1);
    if (!row)
        throw notFound('Cobertura em directo não encontrada.');
    const updates = await db
        .select(liveUpdateColumns)
        .from(liveCoverageUpdates)
        .where(and(eq(liveCoverageUpdates.coverageId, row.id), eq(liveCoverageUpdates.status, 'published')))
        .orderBy(desc(liveCoverageUpdates.eventAt), desc(liveCoverageUpdates.publishedAt))
        .limit(limit);
    const [totalRow] = await db
        .select({ total: count() })
        .from(liveCoverageUpdates)
        .where(and(eq(liveCoverageUpdates.coverageId, row.id), eq(liveCoverageUpdates.status, 'published')));
    const { coverMediaId, ...coverage } = row;
    return {
        ...coverage,
        ...mediaUrls(coverMediaId),
        updates: updates.map(presentLiveUpdate),
        updatesTotal: Number(totalRow.total),
        serverTime: new Date().toISOString(),
    };
}
export async function resolveLiveCoverageId(slugOrId) {
    const [row] = await db
        .select({ id: liveCoverages.id })
        .from(liveCoverages)
        .where(and(or(eq(liveCoverages.slug, slugOrId), eq(liveCoverages.id, slugOrId)), isNull(liveCoverages.deletedAt)))
        .limit(1);
    if (!row)
        throw notFound('Cobertura em directo não encontrada.');
    return row.id;
}
export async function getLiveUpdatesSince(coverageId, since) {
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
        throw badRequest('INVALID_SINCE', 'Data «since» inválida. Use formato ISO.');
    }
    const [coverage] = await db
        .select({
        id: liveCoverages.id,
        status: liveCoverages.status,
        streamStatus: liveCoverages.streamStatus,
        lastUpdateAt: liveCoverages.lastUpdateAt,
    })
        .from(liveCoverages)
        .where(and(eq(liveCoverages.id, coverageId), isNull(liveCoverages.deletedAt), inArray(liveCoverages.status, ['scheduled', 'live', 'paused', 'ended'])))
        .limit(1);
    if (!coverage)
        throw notFound('Cobertura em directo não encontrada.');
    const updates = await db
        .select(liveUpdateColumns)
        .from(liveCoverageUpdates)
        .where(and(eq(liveCoverageUpdates.coverageId, coverageId), eq(liveCoverageUpdates.status, 'published'), gte(liveCoverageUpdates.publishedAt, sinceDate)))
        .orderBy(desc(liveCoverageUpdates.eventAt))
        .limit(100);
    const withdrawn = await db
        .select({ id: liveCoverageUpdates.id })
        .from(liveCoverageUpdates)
        .where(and(eq(liveCoverageUpdates.coverageId, coverageId), eq(liveCoverageUpdates.status, 'withdrawn'), gte(liveCoverageUpdates.withdrawnAt, sinceDate)))
        .limit(100);
    return {
        status: coverage.status,
        streamStatus: coverage.streamStatus,
        lastUpdateAt: coverage.lastUpdateAt,
        updates: updates.map(presentLiveUpdate),
        withdrawnIds: withdrawn.map((item) => item.id),
        serverTime: new Date().toISOString(),
    };
}
export async function listPublishedVideos(input = {}) {
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 12, 50);
    const filters = [eq(videos.isPublished, true), lte(videos.publishedAt, new Date())];
    if (input.categorySlug)
        filters.push(eq(categories.slug, input.categorySlug));
    const where = and(...filters);
    const [totalRow] = await db
        .select({ total: count() })
        .from(videos)
        .innerJoin(categories, eq(videos.categoryId, categories.id))
        .where(where);
    const meta = paginateMeta(Number(totalRow.total), page, pageSize);
    const items = await db
        .select({
        id: videos.id,
        slug: videos.slug,
        title: videos.title,
        description: videos.description,
        duration: videos.duration,
        thumbnailUrl: videos.thumbnailUrl,
        sourceUrl: videos.sourceUrl,
        publishedAt: videos.publishedAt,
        categorySlug: categories.slug,
        categoryName: categories.name,
    })
        .from(videos)
        .innerJoin(categories, eq(videos.categoryId, categories.id))
        .where(where)
        .orderBy(desc(videos.publishedAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return { items, ...meta };
}
export async function listPublishedGalleries(input = {}) {
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 12, 50);
    const where = and(eq(galleries.isPublished, true), lte(galleries.publishedAt, new Date()));
    const [totalRow] = await db.select({ total: count() }).from(galleries).where(where);
    const meta = paginateMeta(Number(totalRow.total), page, pageSize);
    const items = await db
        .select({
        id: galleries.id,
        slug: galleries.slug,
        title: galleries.title,
        description: galleries.description,
        coverUrl: galleries.coverUrl,
        publishedAt: galleries.publishedAt,
    })
        .from(galleries)
        .where(where)
        .orderBy(desc(galleries.publishedAt))
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return {
        items: items.map((item) => ({ ...item, coverUrl: publishedMediaUrl(item.coverUrl) })),
        ...meta,
    };
}
export async function getGalleryBySlug(slug) {
    const [gallery] = await db
        .select({
        id: galleries.id,
        slug: galleries.slug,
        title: galleries.title,
        description: galleries.description,
        coverUrl: galleries.coverUrl,
        publishedAt: galleries.publishedAt,
    })
        .from(galleries)
        .where(and(eq(galleries.slug, slug), eq(galleries.isPublished, true)))
        .limit(1);
    if (!gallery)
        throw notFound('Galeria não encontrada.');
    const photos = await db
        .select()
        .from(galleryPhotos)
        .where(eq(galleryPhotos.galleryId, gallery.id))
        .orderBy(asc(galleryPhotos.sortOrder));
    return {
        ...gallery,
        coverUrl: publishedMediaUrl(gallery.coverUrl),
        photos: photos.map((photo) => ({
            id: photo.id,
            src: photo.mediaId ? mediaPublicUrl(`/media/${photo.mediaId}/original`) : photo.src,
            thumbSrc: photo.mediaId ? mediaPublicUrl(`/media/${photo.mediaId}/thumb`) : photo.src,
            alt: photo.alt,
            caption: photo.caption,
        })),
    };
}
export async function listTrending(opts) {
    const limit = Math.min(opts?.limit ?? 8, 20);
    const days = Math.min(Math.max(opts?.days ?? 3, 1), 30);
    const topicRows = await db
        .select({
        id: trendingTopics.id,
        position: trendingTopics.position,
        title: trendingTopics.title,
        slug: trendingTopics.slug,
        articleSlug: articles.slug,
        categorySlug: categories.slug,
    })
        .from(trendingTopics)
        .leftJoin(articles, and(eq(trendingTopics.articleId, articles.id), eq(articles.status, 'published'), isNull(articles.deletedAt)))
        .leftJoin(categories, eq(trendingTopics.categoryId, categories.id))
        .where(eq(trendingTopics.isActive, true))
        .orderBy(asc(trendingTopics.position))
        .limit(limit);
    const today = luandaDay();
    const from = shiftDay(today, -(days - 1));
    const viewRows = await db
        .select({
        articleId: pageViewDaily.entityId,
        views: sql `SUM(${pageViewDaily.views})`,
    })
        .from(pageViewDaily)
        .where(and(eq(pageViewDaily.entityType, 'article'), gte(pageViewDaily.day, from), lte(pageViewDaily.day, today)))
        .groupBy(pageViewDaily.entityId)
        .orderBy(desc(sql `SUM(${pageViewDaily.views})`))
        .limit(limit);
    let trendingArticles = [];
    if (viewRows.length) {
        const cards = await queryArticleCards(and(...publishedArticleFilters(), inArray(articles.id, viewRows.map((row) => row.articleId))), limit);
        const rank = new Map(viewRows.map((row, index) => [row.articleId, index]));
        trendingArticles = cards
            .map((card) => ({ ...card, views: Number(viewRows[rank.get(card.id) ?? 0]?.views ?? 0) }))
            .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }
    return { topics: topicRows, articles: trendingArticles };
}
export async function getSitemapData() {
    const [articleRows, categoryRows, liveRows, videoRows, galleryRows] = await Promise.all([
        db
            .select({
            slug: articles.slug,
            publishedAt: articles.publishedAt,
            updatedAt: articles.updatedAt,
            categorySlug: categories.slug,
        })
            .from(articles)
            .innerJoin(categories, eq(articles.categoryId, categories.id))
            .where(and(...publishedArticleFilters(), eq(articles.noindex, false)))
            .orderBy(desc(articles.publishedAt))
            .limit(5000),
        db
            .select({ slug: categories.slug, updatedAt: categories.updatedAt })
            .from(categories)
            .where(eq(categories.isActive, true)),
        db
            .select({ slug: liveCoverages.slug, updatedAt: liveCoverages.updatedAt })
            .from(liveCoverages)
            .where(and(isNull(liveCoverages.deletedAt), eq(liveCoverages.noindex, false), inArray(liveCoverages.status, ['live', 'paused', 'ended']))),
        db
            .select({ slug: videos.slug, publishedAt: videos.publishedAt, updatedAt: videos.updatedAt })
            .from(videos)
            .where(eq(videos.isPublished, true)),
        db
            .select({ slug: galleries.slug, publishedAt: galleries.publishedAt, updatedAt: galleries.updatedAt })
            .from(galleries)
            .where(eq(galleries.isPublished, true)),
    ]);
    return {
        articles: articleRows,
        categories: categoryRows,
        authors: [],
        live: liveRows,
        videos: videoRows,
        galleries: galleryRows,
    };
}
export async function listArchiveYears() {
    const rows = await db
        .select({
        year: sql `YEAR(DATE_ADD(${articles.publishedAt}, INTERVAL 1 HOUR))`,
    })
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .where(and(...publishedArticleFilters()))
        .groupBy(sql `YEAR(DATE_ADD(${articles.publishedAt}, INTERVAL 1 HOUR))`)
        .orderBy(desc(sql `YEAR(DATE_ADD(${articles.publishedAt}, INTERVAL 1 HOUR))`));
    return rows.map((row) => Number(row.year)).filter((year) => Number.isFinite(year));
}
