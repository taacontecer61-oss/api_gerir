import { and, count, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { articles, categories, liveCoverages, users } from '../db/schema/index.js';
import { badRequest } from '../lib/errors.js';
import { getTopContent, getTotalViews, getViewsSeries, luandaDay, shiftDay } from './analytics.js';
export function resolveRange(from, to, defaultDays = 30) {
    const end = to ?? luandaDay();
    const start = from ?? shiftDay(end, -(defaultDays - 1));
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(start) || !pattern.test(end) || start > end) {
        throw badRequest('INVALID_RANGE', 'O intervalo de datas é inválido.');
    }
    const span = (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000;
    if (span > 366)
        throw badRequest('INVALID_RANGE', 'O intervalo máximo é de 366 dias.');
    return { from: start, to: end };
}
/** Produção actual por autor (conta de utilizador), sem filtro de datas. */
export async function getEditorialProduction(onlyUserId) {
    const filters = [isNull(articles.deletedAt)];
    if (onlyUserId)
        filters.push(eq(articles.authorUserId, onlyUserId));
    const rows = await db
        .select({
        userId: articles.authorUserId,
        name: sql `COALESCE(MAX(${users.name}), MAX(NULLIF(${articles.authorName}, '')), 'Redacção')`,
        isActive: sql `MAX(${users.isActive})`,
        created: count(),
        published: sql `SUM(CASE WHEN ${articles.status} = 'published' THEN 1 ELSE 0 END)`,
        pending: sql `SUM(CASE WHEN ${articles.status} IN ('draft', 'in_review', 'returned', 'approved', 'scheduled') THEN 1 ELSE 0 END)`,
    })
        .from(articles)
        .leftJoin(users, eq(articles.authorUserId, users.id))
        .where(and(...filters))
        .groupBy(articles.authorUserId, sql `IF(${articles.authorUserId} IS NULL, ${articles.authorName}, '')`);
    return rows
        .map((row) => ({
        userId: row.userId,
        name: row.name,
        isActive: row.isActive == null ? null : Boolean(Number(row.isActive)),
        created: Number(row.created),
        published: Number(row.published),
        pending: Number(row.pending),
    }))
        .sort((a, b) => b.published - a.published || b.created - a.created || a.name.localeCompare(b.name, 'pt'));
}
export async function getReportsOverview(range) {
    const rangeStart = new Date(`${range.from}T00:00:00Z`);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
    const rangeEnd = new Date(`${range.to}T00:00:00Z`);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 2);
    const [series, topContent, totalViews] = await Promise.all([
        getViewsSeries(undefined, range.from, range.to),
        getTopContent(range.from, range.to, 10),
        getTotalViews(range.from, range.to),
    ]);
    const publishedRows = await db
        .select({
        publishedAt: articles.publishedAt,
        categoryName: categories.name,
        authorName: sql `COALESCE(${users.name}, NULLIF(${articles.authorName}, ''), 'Redacção')`,
    })
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(users, eq(articles.authorUserId, users.id))
        .where(and(eq(articles.status, 'published'), isNull(articles.deletedAt), gte(articles.publishedAt, rangeStart), lte(articles.publishedAt, rangeEnd)));
    const publishedPerDay = new Map();
    const byCategory = new Map();
    const byAuthor = new Map();
    let publishedInRange = 0;
    for (const row of publishedRows) {
        if (!row.publishedAt)
            continue;
        const day = luandaDay(row.publishedAt);
        if (day < range.from || day > range.to)
            continue;
        publishedInRange += 1;
        publishedPerDay.set(day, (publishedPerDay.get(day) ?? 0) + 1);
        byCategory.set(row.categoryName, (byCategory.get(row.categoryName) ?? 0) + 1);
        byAuthor.set(row.authorName, (byAuthor.get(row.authorName) ?? 0) + 1);
    }
    const rank = (map) => [...map.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    const statusRows = await db
        .select({ status: articles.status, total: count() })
        .from(articles)
        .where(isNull(articles.deletedAt))
        .groupBy(articles.status);
    const liveRows = await db
        .select({ status: liveCoverages.status, total: count() })
        .from(liveCoverages)
        .where(isNull(liveCoverages.deletedAt))
        .groupBy(liveCoverages.status);
    return {
        range,
        views: {
            total: totalViews,
            uniqueSessions: series.reduce((sum, item) => sum + item.uniqueSessions, 0),
            series,
        },
        topContent,
        articles: {
            publishedInRange,
            publishedPerDay: series.map((item) => ({
                day: item.day,
                total: publishedPerDay.get(item.day) ?? 0,
            })),
            byStatus: Object.fromEntries(statusRows.map((row) => [row.status, Number(row.total)])),
            byCategory: rank(byCategory),
            byAuthor: rank(byAuthor),
            production: await getEditorialProduction(),
        },
        live: {
            byStatus: Object.fromEntries(liveRows.map((row) => [row.status, Number(row.total)])),
        },
    };
}
function csvCell(value) {
    const text = String(value);
    // Neutraliza fórmulas (CSV injection) e escapa aspas/separadores.
    const safe = /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
    return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
/** CSV diário (data, visualizações, sessões únicas, artigos publicados) para o intervalo. */
export async function exportReportsCsv(range) {
    const overview = await getReportsOverview(range);
    const published = new Map(overview.articles.publishedPerDay.map((item) => [item.day, item.total]));
    const lines = [
        ['data', 'visualizacoes', 'sessoes_unicas', 'artigos_publicados'].join(','),
        ...overview.views.series.map((item) => [item.day, item.views, item.uniqueSessions, published.get(item.day) ?? 0]
            .map(csvCell)
            .join(',')),
    ];
    // BOM para o Excel reconhecer UTF-8.
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}
