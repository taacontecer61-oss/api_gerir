import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { articles, auditLogs, categories, liveCoverages, pageViewDaily, roles, userRoles, users, } from '../db/schema/index.js';
import { PERMISSIONS, ROLE_SLUGS } from '../lib/permissions.js';
import { badRequest } from '../lib/errors.js';
import { currentMonthRange, getTopArticlesByViews, getTopCountriesByViews, getViewsSeries, luandaDay, shiftDay, } from './analytics.js';
import { getEditorialProduction, resolveRange } from './reports.js';
function canSeeAllProduction(user) {
    return (user.permissions.includes(PERMISSIONS.ARTICLES_EDIT_ANY) ||
        user.permissions.includes(PERMISSIONS.REPORTS_READ) ||
        user.permissions.includes(PERMISSIONS.USERS_MANAGE));
}
function articleScope(user) {
    if (canSeeAllProduction(user))
        return isNull(articles.deletedAt);
    return and(isNull(articles.deletedAt), or(eq(articles.authorUserId, user.id), eq(articles.createdByUserId, user.id)));
}
export const DASHBOARD_RANGES = ['today', '7d', '30d', 'custom'];
export function resolveDashboardRange(input) {
    const key = input.range ?? '7d';
    const today = luandaDay();
    if (key === 'today')
        return { key, from: today, to: today };
    if (key === '7d')
        return { key, from: shiftDay(today, -6), to: today };
    if (key === '30d')
        return { key, from: shiftDay(today, -29), to: today };
    if (!input.from || !input.to) {
        throw badRequest('INVALID_RANGE', 'Indique «from» e «to» para um intervalo personalizado.');
    }
    return { key, ...resolveRange(input.from, input.to) };
}
/** Séries para gráficos: publicações por dia, visualizações por dia e distribuição por categoria. */
export async function getDashboardCharts(range) {
    const rangeStart = new Date(`${range.from}T00:00:00Z`);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
    const rangeEnd = new Date(`${range.to}T00:00:00Z`);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 2);
    const [viewsSeries, publishedRows, categoryViews] = await Promise.all([
        getViewsSeries(undefined, range.from, range.to),
        db
            .select({
            publishedAt: articles.publishedAt,
            categoryId: categories.id,
            categoryName: categories.name,
            categorySlug: categories.slug,
        })
            .from(articles)
            .innerJoin(categories, eq(articles.categoryId, categories.id))
            .where(and(eq(articles.status, 'published'), isNull(articles.deletedAt), gte(articles.publishedAt, rangeStart), lte(articles.publishedAt, rangeEnd))),
        db
            .select({
            categoryId: categories.id,
            views: sql `SUM(${pageViewDaily.views})`,
        })
            .from(pageViewDaily)
            .innerJoin(articles, eq(pageViewDaily.entityId, articles.id))
            .innerJoin(categories, eq(articles.categoryId, categories.id))
            .where(and(eq(pageViewDaily.entityType, 'article'), gte(pageViewDaily.day, range.from), lte(pageViewDaily.day, range.to)))
            .groupBy(categories.id)
            .orderBy(asc(categories.id)),
    ]);
    const publishedPerDay = new Map();
    const publishedByCategory = new Map();
    for (const row of publishedRows) {
        if (!row.publishedAt)
            continue;
        const day = luandaDay(row.publishedAt);
        if (day < range.from || day > range.to)
            continue;
        publishedPerDay.set(day, (publishedPerDay.get(day) ?? 0) + 1);
        const entry = publishedByCategory.get(row.categoryId) ?? {
            name: row.categoryName,
            slug: row.categorySlug,
            published: 0,
        };
        entry.published += 1;
        publishedByCategory.set(row.categoryId, entry);
    }
    const viewsByCategory = new Map(categoryViews.map((row) => [row.categoryId, Number(row.views)]));
    const categoryIds = new Set([...publishedByCategory.keys(), ...viewsByCategory.keys()]);
    const categoryNames = new Map();
    const missing = [...categoryIds].filter((id) => !publishedByCategory.has(id));
    if (missing.length) {
        const rows = await db
            .select({ id: categories.id, name: categories.name, slug: categories.slug })
            .from(categories)
            .where(inArray(categories.id, missing));
        rows.forEach((row) => categoryNames.set(row.id, { name: row.name, slug: row.slug }));
    }
    const byCategory = [...categoryIds]
        .map((id) => {
        const published = publishedByCategory.get(id);
        const meta = published ?? categoryNames.get(id);
        return {
            categoryId: id,
            name: meta?.name ?? '—',
            slug: meta?.slug ?? '',
            published: published?.published ?? 0,
            views: viewsByCategory.get(id) ?? 0,
        };
    })
        .sort((a, b) => b.views - a.views || b.published - a.published);
    return {
        range,
        publicationsPerDay: viewsSeries.map((item) => ({
            day: item.day,
            total: publishedPerDay.get(item.day) ?? 0,
        })),
        viewsPerDay: viewsSeries.map((item) => ({
            day: item.day,
            views: item.views,
            uniqueSessions: item.uniqueSessions,
        })),
        byCategory,
    };
}
async function editorialProductionFor(user) {
    const seeAll = canSeeAllProduction(user);
    const rows = await getEditorialProduction(seeAll ? undefined : user.id);
    if (!seeAll && rows.length === 0) {
        rows.push({
            userId: user.id,
            name: user.name,
            isActive: true,
            created: 0,
            published: 0,
            pending: 0,
        });
    }
    return { scope: seeAll ? 'all' : 'own', rows };
}
function serializeTopArticle(row) {
    return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        authorName: row.authorName,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        views: row.views,
        rank: row.rank,
    };
}
/**
 * Rankings de visualizações do mês civil (fuso da plataforma).
 * Administradores: top 3 globais + países. Restantes: apenas artigos próprios.
 */
async function articleViewRankingsFor(user) {
    const month = currentMonthRange();
    const seeAll = canSeeAllProduction(user);
    if (seeAll) {
        const [topArticlesMonth, topCountriesMonth] = await Promise.all([
            getTopArticlesByViews({
                from: month.from,
                to: month.to,
                limit: 3,
            }),
            getTopCountriesByViews(month.from, month.to, 15),
        ]);
        return {
            viewsPeriod: month,
            topArticlesMonth: topArticlesMonth.map(serializeTopArticle),
            topCountriesMonth,
            myTopArticles: null,
        };
    }
    const myTopArticles = await getTopArticlesByViews({
        from: month.from,
        to: month.to,
        limit: 20,
        authorUserId: user.id,
        includeZeroViews: true,
    });
    return {
        viewsPeriod: month,
        topArticlesMonth: null,
        topCountriesMonth: null,
        myTopArticles: myTopArticles.map(serializeTopArticle),
    };
}
export async function getDashboardStats(user, rangeInput = {}) {
    const chartRange = resolveDashboardRange(rangeInput);
    const visible = articleScope(user);
    const [totals] = await db
        .select({
        total: count(),
        published: sql `SUM(CASE WHEN ${articles.status} = 'published' THEN 1 ELSE 0 END)`,
        drafts: sql `SUM(CASE WHEN ${articles.status} = 'draft' THEN 1 ELSE 0 END)`,
        inReview: sql `SUM(CASE WHEN ${articles.status} = 'in_review' THEN 1 ELSE 0 END)`,
        returned: sql `SUM(CASE WHEN ${articles.status} = 'returned' THEN 1 ELSE 0 END)`,
        approved: sql `SUM(CASE WHEN ${articles.status} = 'approved' THEN 1 ELSE 0 END)`,
        scheduled: sql `SUM(CASE WHEN ${articles.status} = 'scheduled' THEN 1 ELSE 0 END)`,
        archived: sql `SUM(CASE WHEN ${articles.status} = 'archived' THEN 1 ELSE 0 END)`,
        rejected: sql `SUM(CASE WHEN ${articles.status} = 'rejected' THEN 1 ELSE 0 END)`,
    })
        .from(articles)
        .where(visible);
    const upcoming = await db
        .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        scheduledAt: articles.scheduledAt,
    })
        .from(articles)
        .where(and(eq(articles.status, 'scheduled'), articleScope(user)))
        .orderBy(articles.scheduledAt)
        .limit(8);
    const recentlyUpdated = await db
        .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        updatedAt: articles.updatedAt,
        authorName: sql `COALESCE(${users.name}, NULLIF(${articles.authorName}, ''), 'Redacção')`,
    })
        .from(articles)
        .leftJoin(users, eq(articles.authorUserId, users.id))
        .where(articleScope(user))
        .orderBy(desc(articles.updatedAt))
        .limit(8);
    const recentActivity = user.permissions.includes(PERMISSIONS.AUDIT_READ)
        ? await db
            .select({
            id: auditLogs.id,
            action: auditLogs.action,
            entityType: auditLogs.entityType,
            entityId: auditLogs.entityId,
            actorUserId: auditLogs.actorUserId,
            createdAt: auditLogs.createdAt,
        })
            .from(auditLogs)
            .orderBy(desc(auditLogs.createdAt))
            .limit(12)
        : [];
    const today = luandaDay();
    const recentPublished = await db
        .select({ publishedAt: articles.publishedAt })
        .from(articles)
        .where(and(eq(articles.status, 'published'), articleScope(user), gte(articles.publishedAt, new Date(Date.now() - 48 * 3_600_000))));
    const publishedToday = recentPublished.filter((row) => row.publishedAt && luandaDay(row.publishedAt) === today).length;
    const [liveRow] = await db
        .select({ total: count() })
        .from(liveCoverages)
        .where(and(isNull(liveCoverages.deletedAt), eq(liveCoverages.status, 'live')));
    const [viewsRow] = await db
        .select({ views: sql `COALESCE(SUM(${pageViewDaily.views}), 0)` })
        .from(pageViewDaily)
        .where(gte(pageViewDaily.day, shiftDay(today, -6)));
    const [journalistsRow] = await db
        .select({ total: sql `COUNT(DISTINCT ${users.id})` })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(eq(users.isActive, true), inArray(roles.slug, [ROLE_SLUGS.JOURNALIST, ROLE_SLUGS.EDITOR])));
    const [production, articleViews] = await Promise.all([
        editorialProductionFor(user),
        articleViewRankingsFor(user),
    ]);
    return {
        totals: {
            total: Number(totals?.total ?? 0),
            published: Number(totals?.published ?? 0),
            drafts: Number(totals?.drafts ?? 0),
            inReview: Number(totals?.inReview ?? 0),
            returned: Number(totals?.returned ?? 0),
            approved: Number(totals?.approved ?? 0),
            scheduled: Number(totals?.scheduled ?? 0),
            archived: Number(totals?.archived ?? 0),
            rejected: Number(totals?.rejected ?? 0),
            publishedToday,
            liveActive: Number(liveRow?.total ?? 0),
            views7d: Number(viewsRow?.views ?? 0),
            activeJournalists: Number(journalistsRow?.total ?? 0),
        },
        production,
        upcoming,
        recentlyUpdated,
        recentActivity,
        charts: await getDashboardCharts(chartRange),
        viewsPeriod: articleViews.viewsPeriod,
        topArticlesMonth: articleViews.topArticlesMonth,
        topCountriesMonth: articleViews.topCountriesMonth,
        myTopArticles: articleViews.myTopArticles,
    };
}
