import { z } from 'zod';
import { siteUrl } from '../../config.js';
import { archiveRange } from '../../lib/archive-range.js';
import { cacheGet, cacheSet, publicCacheKey } from '../../lib/cache.js';
import { buildRssFeed } from '../../lib/rss.js';
import { resolveRedirect } from '../../services/redirects.js';
import { getAllSettings } from '../../services/settings.js';
import { getFeaturedContent, getGalleryBySlug, getLiveBySlug, getLiveUpdatesSince, getPublishedArticleBySlug, getRssFeedItems, getSitemapData, listActiveLiveCoverages, listArchiveYears, listCategories, listPublishedArticles, listPublishedGalleries, listPublishedVideos, listTrending, resolveLiveCoverageId, searchPublished, } from '../../services/public-content.js';
const pageQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(50).default(12),
});
const articlesQuery = pageQuery.extend({
    category: z.string().max(64).optional(),
    author: z.string().max(96).optional(),
    tag: z.string().max(96).optional(),
    featured: z.enum(['true', 'false']).optional(),
    highlight: z.enum(['true', 'false']).optional(),
    indexable: z.enum(['true', 'false']).optional(),
    year: z.coerce.number().int().min(1990).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    day: z.coerce.number().int().min(1).max(31).optional(),
});
const searchQuery = pageQuery.extend({
    q: z.string().min(1).max(100),
});
const videosQuery = pageQuery.extend({
    category: z.string().max(64).optional(),
});
const liveQuery = z.object({
    limit: z.coerce.number().int().positive().max(30).default(10),
    scheduled: z.enum(['true', 'false']).optional(),
});
const liveDetailQuery = z.object({
    limit: z.coerce.number().int().positive().max(200).default(100),
});
const sinceQuery = z.object({
    since: z.string().min(1),
});
const trendingQuery = z.object({
    days: z.coerce.number().int().positive().max(30).default(3),
    limit: z.coerce.number().int().positive().max(20).default(8),
});
const featuredQuery = z.object({
    limit: z.coerce.number().int().positive().max(20).default(8),
});
function cacheControl(reply, seconds) {
    reply.header('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds}`);
}
async function cachedJson(request, reply, seconds, load) {
    cacheControl(reply, seconds);
    const key = publicCacheKey(request.url);
    const hit = await cacheGet(key);
    if (hit) {
        reply.header('X-Cache', 'HIT');
        return hit;
    }
    const data = await load();
    await cacheSet(key, data, seconds);
    reply.header('X-Cache', 'MISS');
    return data;
}
export const publicContentRoutes = async (app) => {
    app.get('/api/public/articles', async (request, reply) => {
        const query = articlesQuery.parse(request.query);
        const range = query.year ? archiveRange(query.year, query.month, query.day) : null;
        return cachedJson(request, reply, 30, () => listPublishedArticles({
            page: query.page,
            pageSize: query.pageSize,
            categorySlug: query.category,
            tagSlug: query.tag,
            featured: query.featured ? query.featured === 'true' : undefined,
            highlight: query.highlight ? query.highlight === 'true' : undefined,
            respectNoindex: query.indexable === 'true',
            publishedFrom: range?.from,
            publishedTo: range?.to,
        }));
    });
    app.get('/api/public/archive/years', async (request, reply) => {
        return cachedJson(request, reply, 120, async () => ({ years: await listArchiveYears() }));
    });
    app.get('/api/public/articles/:slug', async (request, reply) => {
        const { slug } = request.params;
        return cachedJson(request, reply, 30, () => getPublishedArticleBySlug(slug));
    });
    app.get('/api/public/categories', async (request, reply) => {
        return cachedJson(request, reply, 120, async () => ({ items: await listCategories() }));
    });
    app.get('/api/public/search', async (request, reply) => {
        const query = searchQuery.parse(request.query);
        return cachedJson(request, reply, 15, () => searchPublished({ q: query.q, page: query.page, pageSize: query.pageSize }));
    });
    app.get('/api/public/featured', async (request, reply) => {
        const query = featuredQuery.parse(request.query);
        return cachedJson(request, reply, 30, () => getFeaturedContent(query.limit));
    });
    app.get('/api/public/live', async (request, reply) => {
        const query = liveQuery.parse(request.query);
        return cachedJson(request, reply, 5, async () => ({
            items: await listActiveLiveCoverages({
                limit: query.limit,
                includeScheduled: query.scheduled === 'true',
            }),
        }));
    });
    app.get('/api/public/live/:slug', async (request, reply) => {
        const { slug } = request.params;
        const query = liveDetailQuery.parse(request.query);
        return cachedJson(request, reply, 5, () => getLiveBySlug(slug, { limit: query.limit }));
    });
    app.get('/api/public/live/:slug/updates', async (request, reply) => {
        const { slug } = request.params;
        const query = sinceQuery.parse(request.query);
        const coverageId = await resolveLiveCoverageId(slug);
        return cachedJson(request, reply, 3, () => getLiveUpdatesSince(coverageId, query.since));
    });
    app.get('/api/public/videos', async (request, reply) => {
        const query = videosQuery.parse(request.query);
        return cachedJson(request, reply, 60, () => listPublishedVideos({
            page: query.page,
            pageSize: query.pageSize,
            categorySlug: query.category,
        }));
    });
    app.get('/api/public/galleries', async (request, reply) => {
        const query = pageQuery.parse(request.query);
        return cachedJson(request, reply, 60, () => listPublishedGalleries(query));
    });
    app.get('/api/public/galleries/:slug', async (request, reply) => {
        const { slug } = request.params;
        return cachedJson(request, reply, 60, () => getGalleryBySlug(slug));
    });
    app.get('/api/public/trending', async (request, reply) => {
        const query = trendingQuery.parse(request.query);
        return cachedJson(request, reply, 60, () => listTrending(query));
    });
    app.get('/api/public/sitemap-data', async (request, reply) => {
        return cachedJson(request, reply, 300, () => getSitemapData());
    });
    app.get('/sitemap.xml', async (request, reply) => {
        const data = await cachedJson(request, reply, 300, () => getSitemapData());
        cacheControl(reply, 300);
        return reply.type('application/xml; charset=utf-8').send(renderSitemap(data));
    });
    app.get('/api/public/rss.xml', async (_request, reply) => {
        const [items, config] = await Promise.all([getRssFeedItems(), getAllSettings()]);
        const xml = buildRssFeed({
            title: String(config['site.name']),
            link: siteUrl,
            description: String(config['site.tagline'] || config['site.name']),
            selfUrl: `${siteUrl}/api/public/rss.xml`,
            items: items.map((item) => ({
                title: item.title,
                link: `${siteUrl}/${item.slug}`,
                description: item.summary,
                pubDate: item.publishedAt,
                category: item.categoryName,
                author: item.authorName,
            })),
        });
        cacheControl(reply, 300);
        return reply.type('application/rss+xml; charset=utf-8').send(xml);
    });
    app.get('/api/public/redirects/resolve', async (request, reply) => {
        const query = z.object({ path: z.string().min(1).max(255) }).parse(request.query);
        return cachedJson(request, reply, 60, () => resolveRedirect(query.path));
    });
};
function xml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function lastmod(value) {
    if (!value)
        return '';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime()))
        return '';
    return `\n    <lastmod>${date.toISOString().slice(0, 10)}</lastmod>`;
}
function renderSitemap(data) {
    const urls = [
        { loc: `${siteUrl}/`, lastmod: null },
        ...data.categories.map((item) => ({ loc: `${siteUrl}/${item.slug}`, lastmod: item.updatedAt })),
        ...data.articles.map((item) => ({
            loc: `${siteUrl}/${item.slug}`,
            lastmod: item.updatedAt ?? item.publishedAt,
        })),
        ...data.live.map((item) => ({ loc: `${siteUrl}/em-direto/${item.slug}`, lastmod: item.updatedAt })),
        ...data.videos.map((item) => ({
            loc: `${siteUrl}/videos/${item.slug}`,
            lastmod: item.updatedAt ?? item.publishedAt,
        })),
        ...data.galleries.map((item) => ({
            loc: `${siteUrl}/galeria/${item.slug}`,
            lastmod: item.updatedAt ?? item.publishedAt,
        })),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
        .map((item) => `  <url>
    <loc>${xml(item.loc)}</loc>${lastmod(item.lastmod)}
  </url>`)
        .join('\n')}
</urlset>
`;
}
