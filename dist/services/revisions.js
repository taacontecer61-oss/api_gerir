import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { articleRevisions, users } from '../db/schema/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { writeAuditLog } from './audit.js';
export function buildArticleSnapshot(article) {
    return {
        title: article.title,
        subtitle: article.subtitle,
        summary: article.summary,
        contentJson: article.contentJson,
        contentHtml: article.contentHtml,
        categoryId: article.categoryId,
        authorId: article.authorId,
        coverMediaId: article.coverMediaId,
        coverAlt: article.coverAlt,
        coverCaption: article.coverCaption,
        featured: article.featured,
        highlight: article.highlight,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        noindex: article.noindex,
        credits: article.credits,
        slug: article.slug,
        status: article.status,
        tags: article.tags.map((tag) => tag.name),
        sources: article.sources ?? null,
        location: article.location ?? null,
        ogImageMediaId: article.ogImageMediaId ?? null,
        relatedArticleIds: article.relatedArticles?.map((item) => item.id) ?? [],
        secondaryCategoryIds: article.secondaryCategories?.map((item) => item.id) ?? [],
        galleryItems: article.galleryItems?.map((item) => ({
            mediaId: item.mediaId,
            caption: item.caption,
            sortOrder: item.sortOrder,
        })) ?? [],
    };
}
export async function saveArticleRevision(articleId, version, snapshot, userId, reason) {
    const snapshotJson = JSON.stringify(snapshot);
    await db
        .insert(articleRevisions)
        .values({
        id: newId(),
        articleId,
        version,
        snapshotJson,
        changedByUserId: userId,
        changeReason: reason?.slice(0, 160) ?? null,
    })
        .onDuplicateKeyUpdate({
        set: {
            snapshotJson,
            changedByUserId: userId,
            changeReason: reason?.slice(0, 160) ?? null,
        },
    });
}
export async function listRevisions(user, articleId) {
    if (!user.permissions.includes(PERMISSIONS.ARTICLES_READ))
        throw forbidden();
    return db
        .select({
        id: articleRevisions.id,
        articleId: articleRevisions.articleId,
        version: articleRevisions.version,
        changeReason: articleRevisions.changeReason,
        changedByUserId: articleRevisions.changedByUserId,
        changedByName: users.name,
        createdAt: articleRevisions.createdAt,
    })
        .from(articleRevisions)
        .leftJoin(users, eq(articleRevisions.changedByUserId, users.id))
        .where(eq(articleRevisions.articleId, articleId))
        .orderBy(desc(articleRevisions.version))
        .limit(100);
}
export async function getRevision(user, articleId, revisionId) {
    if (!user.permissions.includes(PERMISSIONS.ARTICLES_READ))
        throw forbidden();
    const [row] = await db
        .select()
        .from(articleRevisions)
        .where(and(eq(articleRevisions.id, revisionId), eq(articleRevisions.articleId, articleId)))
        .limit(1);
    if (!row)
        throw notFound('Revisão não encontrada.');
    return {
        id: row.id,
        articleId: row.articleId,
        version: row.version,
        changeReason: row.changeReason,
        changedByUserId: row.changedByUserId,
        createdAt: row.createdAt,
        snapshot: parseSnapshot(row.snapshotJson),
    };
}
/** Devolve as duas revisões (snapshots completos) e a lista de campos que diferem. */
export async function compareRevisions(user, articleId, revisionAId, revisionBId) {
    const [a, b] = await Promise.all([
        getRevision(user, articleId, revisionAId),
        getRevision(user, articleId, revisionBId),
    ]);
    const keys = new Set([...Object.keys(a.snapshot), ...Object.keys(b.snapshot)]);
    const changedFields = [...keys].filter((key) => JSON.stringify(a.snapshot[key] ?? null) !==
        JSON.stringify(b.snapshot[key] ?? null));
    return { a, b, changedFields };
}
export function parseSnapshot(json) {
    try {
        return JSON.parse(json);
    }
    catch {
        throw badRequest('INVALID_REVISION', 'Revisão corrompida.');
    }
}
export async function getRevisionSnapshot(articleId, revisionId) {
    const [row] = await db
        .select()
        .from(articleRevisions)
        .where(and(eq(articleRevisions.id, revisionId), eq(articleRevisions.articleId, articleId)))
        .limit(1);
    if (!row)
        throw notFound('Revisão não encontrada.');
    return { version: row.version, snapshot: parseSnapshot(row.snapshotJson) };
}
export async function restoreRevision(user, articleId, revisionId, currentVersion) {
    const { getArticle, updateArticle } = await import('./articles.js');
    const { version, snapshot } = await getRevisionSnapshot(articleId, revisionId);
    const current = await getArticle(articleId);
    if (current.version !== currentVersion) {
        throw conflict('VERSION_CONFLICT', 'O artigo foi alterado. Recarregue e tente novamente.');
    }
    const restored = await updateArticle(user, articleId, {
        version: current.version,
        title: snapshot.title,
        subtitle: snapshot.subtitle,
        summary: snapshot.summary,
        contentJson: snapshot.contentJson,
        contentHtml: snapshot.contentHtml,
        categoryId: snapshot.categoryId,
        authorId: snapshot.authorId,
        coverMediaId: snapshot.coverMediaId,
        coverAlt: snapshot.coverAlt,
        coverCaption: snapshot.coverCaption,
        featured: snapshot.featured,
        highlight: snapshot.highlight,
        seoTitle: snapshot.seoTitle,
        seoDescription: snapshot.seoDescription,
        noindex: snapshot.noindex,
        credits: snapshot.credits,
        tags: snapshot.tags,
        // Campos novos: só restauramos se a revisão os guardou (revisões antigas não têm).
        ...(snapshot.sources !== undefined && { sources: snapshot.sources }),
        ...(snapshot.location !== undefined && { location: snapshot.location }),
        ...(snapshot.ogImageMediaId !== undefined && { ogImageMediaId: snapshot.ogImageMediaId }),
        ...(snapshot.relatedArticleIds !== undefined && { relatedArticleIds: snapshot.relatedArticleIds }),
        ...(snapshot.secondaryCategoryIds !== undefined && {
            secondaryCategoryIds: snapshot.secondaryCategoryIds,
        }),
        ...(snapshot.galleryItems !== undefined && { galleryItems: snapshot.galleryItems }),
    }, { lenient: true });
    await writeAuditLog({
        actorUserId: user.id,
        action: 'article.restore_revision',
        entityType: 'article',
        entityId: articleId,
        meta: { revisionId, fromVersion: version, toVersion: restored.version },
    });
    return restored;
}
