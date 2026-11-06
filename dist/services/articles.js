import { and, asc, count, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { db } from '../db/index.js';
import { articleGalleryItems, articleRelations, articleSecondaryCategories, articleTags, articles, categories, mediaAssets, tags, users, } from '../db/schema/index.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { FEATURED_HOME_LIMIT, SECONDARY_HOME_LIMIT } from '../lib/homepage-slots.js';
import { newId } from '../lib/ids.js';
import { paginateMeta } from '../lib/pagination.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { isReservedSlug } from '../lib/reserved-slugs.js';
import { readingTimeFromHtml, sanitizeArticleHtml } from '../lib/sanitize.js';
import { ensureUniqueSlug, slugify } from '../lib/slugify.js';
import { keepCurrentByline, resolveOriginalAuthor } from './authorship.js';
import { writeAuditLog } from './audit.js';
import { assertMediaExists, replaceMediaUsage } from './media-usage.js';
import { createNotification, notifyUsersWithPermissionSafe } from './notifications.js';
import { upsertInternalRedirect } from './redirects.js';
import { buildArticleSnapshot, saveArticleRevision } from './revisions.js';
const ARTICLE_STATUSES = new Set([
    'draft',
    'in_review',
    'returned',
    'approved',
    'scheduled',
    'published',
    'archived',
    'rejected',
]);
const TRANSITIONS = {
    draft: { submit: 'in_review', archive: 'archived' },
    in_review: { approve: 'approved', return: 'returned', reject: 'rejected' },
    returned: { submit: 'in_review', archive: 'archived' },
    approved: { publish: 'published', schedule: 'scheduled', archive: 'archived' },
    scheduled: { publish: 'published', archive: 'archived' },
    published: { archive: 'archived' },
    archived: { restore: 'draft' },
    rejected: { restore: 'draft', archive: 'archived' },
};
const authorUser = alias(users, 'article_author');
const editorUser = alias(users, 'article_editor');
const approverUser = alias(users, 'article_approver');
const publisherUser = alias(users, 'article_publisher');
const displayAuthorName = sql `COALESCE(${authorUser.name}, NULLIF(${articles.authorName}, ''), 'Redacção')`;
function canEditArticle(user, article) {
    if (user.permissions.includes(PERMISSIONS.ARTICLES_EDIT_ANY))
        return true;
    if (!user.permissions.includes(PERMISSIONS.ARTICLES_EDIT_OWN))
        return false;
    return article.createdByUserId === user.id || article.authorUserId === user.id;
}
function requirePermission(user, permission) {
    if (!user.permissions.includes(permission))
        throw forbidden();
}
async function existingSlugs(excludeId) {
    const rows = await db.select({ id: articles.id, slug: articles.slug }).from(articles);
    return new Set(rows.filter((row) => row.id !== excludeId).map((row) => row.slug));
}
/** Gera slug único a partir do título; nunca aceita slug do cliente. */
async function allocateSlugFromTitle(title, excludeId) {
    const base = slugify(title);
    if (!base)
        throw badRequest('INVALID_SLUG', 'O título não produz um slug válido.');
    if (isReservedSlug(base)) {
        throw badRequest('RESERVED_SLUG', 'Este título gera um slug reservado. Altere o título.');
    }
    return ensureUniqueSlug(base, await existingSlugs(excludeId), new Date().getFullYear());
}
function isDuplicateSlugError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const code = 'code' in error ? String(error.code) : '';
    const errno = 'errno' in error ? Number(error.errno) : 0;
    const message = error instanceof Error ? error.message : String(error);
    return code === 'ER_DUP_ENTRY' || errno === 1062 || /articles_slug_uq|Duplicate entry/i.test(message);
}
function isSeoTitleAutomatic(seoTitle, title) {
    const value = seoTitle?.trim() ?? '';
    return !value || value === title.trim();
}
function isSeoDescriptionAutomatic(seoDescription, summary) {
    const value = seoDescription?.trim() ?? '';
    return !value || value === summary.trim();
}
async function listSlotArticles(slot) {
    const flag = slot === 'featured' ? articles.featured : articles.highlight;
    return db
        .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        publishedAt: articles.publishedAt,
    })
        .from(articles)
        .where(and(eq(flag, true), isNull(articles.deletedAt)))
        .orderBy(desc(articles.publishedAt), desc(articles.updatedAt));
}
export async function listHomepageSlots() {
    const [featured, secondary] = await Promise.all([
        listSlotArticles('featured'),
        listSlotArticles('secondary'),
    ]);
    return {
        featured: { limit: FEATURED_HOME_LIMIT, items: featured },
        secondary: { limit: SECONDARY_HOME_LIMIT, items: secondary },
    };
}
async function prepareHomepageSlotChanges(tx, input) {
    const release = [...new Set((input.releaseIds ?? []).filter((id) => id !== input.articleId))];
    // Bloqueia as linhas das secções para serializar alterações concorrentes.
    await tx.execute(sql `SELECT id FROM articles WHERE deleted_at IS NULL AND (featured = 1 OR highlight = 1) FOR UPDATE`);
    if (release.length) {
        if (input.wantFeatured) {
            await tx
                .update(articles)
                .set({ featured: false })
                .where(and(inArray(articles.id, release), isNull(articles.deletedAt)));
        }
        if (input.wantSecondary) {
            await tx
                .update(articles)
                .set({ highlight: false })
                .where(and(inArray(articles.id, release), isNull(articles.deletedAt)));
        }
    }
}
/** Validação pós-escrita: garante limites mesmo sob corrida. */
async function enforceHomepageSlotLimits(tx, input) {
    if (input.wantFeatured) {
        const [row] = await tx
            .select({ total: count() })
            .from(articles)
            .where(and(eq(articles.featured, true), isNull(articles.deletedAt)));
        if (Number(row.total) > FEATURED_HOME_LIMIT) {
            const items = await listSlotArticles('featured');
            throw conflict('FEATURED_LIMIT', `A secção «Notícia em destaque» admite no máximo ${FEATURED_HOME_LIMIT} artigos.`, { limit: FEATURED_HOME_LIMIT, slot: 'featured', items });
        }
    }
    if (input.wantSecondary) {
        const [row] = await tx
            .select({ total: count() })
            .from(articles)
            .where(and(eq(articles.highlight, true), isNull(articles.deletedAt)));
        if (Number(row.total) > SECONDARY_HOME_LIMIT) {
            const items = await listSlotArticles('secondary');
            throw conflict('SECONDARY_LIMIT', `A secção «Notícias secundárias» admite no máximo ${SECONDARY_HOME_LIMIT} artigos.`, { limit: SECONDARY_HOME_LIMIT, slot: 'secondary', items });
        }
    }
}
const MAX_RELATED = 12;
const MAX_SECONDARY_CATEGORIES = 5;
const MAX_GALLERY_ITEMS = 60;
async function syncTags(tx, articleId, tagNames) {
    if (tagNames === undefined)
        return;
    await tx.delete(articleTags).where(eq(articleTags.articleId, articleId));
    const unique = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))];
    for (const name of unique) {
        const slug = slugify(name);
        const [existing] = await tx.select().from(tags).where(eq(tags.slug, slug)).limit(1);
        let tagId = existing?.id;
        if (!tagId) {
            tagId = newId();
            await tx.insert(tags).values({ id: tagId, slug, name });
        }
        await tx.insert(articleTags).values({ articleId, tagId });
    }
}
async function syncCoverUsage(tx, articleId, coverMediaId) {
    await replaceMediaUsage(tx, 'article', articleId, 'cover', [coverMediaId]);
}
async function syncOgUsage(tx, articleId, ogImageMediaId) {
    await replaceMediaUsage(tx, 'article', articleId, 'og', [ogImageMediaId]);
}
async function syncRelations(tx, articleId, relatedIds, lenient) {
    if (relatedIds === undefined)
        return;
    let unique = [...new Set(relatedIds)];
    if (unique.includes(articleId)) {
        if (!lenient)
            throw badRequest('INVALID_RELATED', 'Um artigo não pode ser relacionado consigo próprio.');
        unique = unique.filter((id) => id !== articleId);
    }
    if (unique.length > MAX_RELATED) {
        throw badRequest('TOO_MANY_RELATED', `Máximo de ${MAX_RELATED} artigos relacionados.`);
    }
    if (unique.length) {
        const found = await tx
            .select({ id: articles.id })
            .from(articles)
            .where(and(inArray(articles.id, unique), isNull(articles.deletedAt)));
        const foundIds = new Set(found.map((row) => row.id));
        if (foundIds.size !== unique.length) {
            if (!lenient)
                throw badRequest('INVALID_RELATED', 'Um ou mais artigos relacionados não existem.');
            unique = unique.filter((id) => foundIds.has(id));
        }
    }
    await tx.delete(articleRelations).where(eq(articleRelations.articleId, articleId));
    if (unique.length) {
        await tx.insert(articleRelations).values(unique.map((relatedArticleId, index) => ({ articleId, relatedArticleId, sortOrder: index })));
    }
}
async function syncSecondaryCategories(tx, articleId, primaryCategoryId, secondaryIds, lenient) {
    if (secondaryIds === undefined)
        return;
    let unique = [...new Set(secondaryIds)].filter((id) => id !== primaryCategoryId);
    if (unique.length > MAX_SECONDARY_CATEGORIES) {
        throw badRequest('TOO_MANY_CATEGORIES', `Máximo de ${MAX_SECONDARY_CATEGORIES} categorias secundárias.`);
    }
    if (unique.length) {
        const found = await tx
            .select({ id: categories.id })
            .from(categories)
            .where(inArray(categories.id, unique));
        const foundIds = new Set(found.map((row) => row.id));
        if (foundIds.size !== unique.length) {
            if (!lenient)
                throw badRequest('INVALID_CATEGORY', 'Uma ou mais categorias secundárias são inválidas.');
            unique = unique.filter((id) => foundIds.has(id));
        }
    }
    await tx.delete(articleSecondaryCategories).where(eq(articleSecondaryCategories.articleId, articleId));
    if (unique.length) {
        await tx
            .insert(articleSecondaryCategories)
            .values(unique.map((categoryId) => ({ articleId, categoryId })));
    }
}
async function syncGallery(tx, articleId, items, lenient) {
    if (items === undefined)
        return;
    if (items.length > MAX_GALLERY_ITEMS) {
        throw badRequest('TOO_MANY_GALLERY_ITEMS', `Máximo de ${MAX_GALLERY_ITEMS} imagens na galeria.`);
    }
    let normalized = items.map((item, index) => ({
        mediaId: item.mediaId,
        caption: item.caption?.trim() || null,
        sortOrder: item.sortOrder ?? index,
    }));
    if (lenient && normalized.length) {
        const found = await tx
            .select({ id: mediaAssets.id })
            .from(mediaAssets)
            .where(inArray(mediaAssets.id, [...new Set(normalized.map((item) => item.mediaId))]));
        const foundIds = new Set(found.map((row) => row.id));
        normalized = normalized.filter((item) => foundIds.has(item.mediaId));
    }
    else {
        await assertMediaExists(tx, normalized.map((item) => item.mediaId));
    }
    await tx.delete(articleGalleryItems).where(eq(articleGalleryItems.articleId, articleId));
    if (normalized.length) {
        await tx.insert(articleGalleryItems).values(normalized.map((item) => ({ id: newId(), articleId, ...item })));
    }
    await replaceMediaUsage(tx, 'article', articleId, 'gallery', normalized.map((item) => item.mediaId));
}
export async function listArticles(input) {
    const filters = [isNull(articles.deletedAt)];
    if (input.status) {
        if (!ARTICLE_STATUSES.has(input.status)) {
            throw badRequest('INVALID_STATUS', 'Estado inválido.');
        }
        filters.push(eq(articles.status, input.status));
    }
    if (input.categoryId)
        filters.push(eq(articles.categoryId, input.categoryId));
    if (input.authorId)
        filters.push(eq(articles.authorUserId, input.authorId));
    if (input.q?.trim()) {
        const q = `%${input.q.trim()}%`;
        filters.push(or(like(articles.title, q), like(articles.summary, q), like(articles.slug, q)));
    }
    const where = and(...filters);
    const [totalRow] = await db.select({ total: count() }).from(articles).where(where);
    const meta = paginateMeta(Number(totalRow.total), input.page, input.pageSize);
    const sortCol = {
        updatedAt: articles.updatedAt,
        publishedAt: articles.publishedAt,
        title: articles.title,
        createdAt: articles.createdAt,
    }[input.sort];
    const orderBy = input.order === 'asc' ? asc(sortCol) : desc(sortCol);
    const rows = await db
        .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        status: articles.status,
        featured: articles.featured,
        highlight: articles.highlight,
        publishedAt: articles.publishedAt,
        scheduledAt: articles.scheduledAt,
        updatedAt: articles.updatedAt,
        version: articles.version,
        categoryName: categories.name,
        categorySlug: categories.slug,
        authorName: displayAuthorName,
    })
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(authorUser, eq(articles.authorUserId, authorUser.id))
        .where(where)
        .orderBy(orderBy)
        .limit(meta.pageSize)
        .offset((meta.page - 1) * meta.pageSize);
    return { items: rows, ...meta };
}
export async function getArticle(id) {
    const [row] = await db
        .select({
        article: articles,
        categoryName: categories.name,
        categorySlug: categories.slug,
        authorName: displayAuthorName,
        editorName: editorUser.name,
        approvedByName: approverUser.name,
        publishedByName: publisherUser.name,
        coverFileId: mediaAssets.id,
    })
        .from(articles)
        .innerJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(authorUser, eq(articles.authorUserId, authorUser.id))
        .leftJoin(editorUser, eq(articles.editorUserId, editorUser.id))
        .leftJoin(approverUser, eq(articles.approvedByUserId, approverUser.id))
        .leftJoin(publisherUser, eq(articles.publishedByUserId, publisherUser.id))
        .leftJoin(mediaAssets, eq(articles.coverMediaId, mediaAssets.id))
        .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
        .limit(1);
    if (!row)
        throw notFound('Artigo não encontrado.');
    const tagRows = await db
        .select({ id: tags.id, name: tags.name, slug: tags.slug })
        .from(articleTags)
        .innerJoin(tags, eq(articleTags.tagId, tags.id))
        .where(eq(articleTags.articleId, id));
    const relatedRows = await db
        .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        status: articles.status,
        sortOrder: articleRelations.sortOrder,
    })
        .from(articleRelations)
        .innerJoin(articles, eq(articleRelations.relatedArticleId, articles.id))
        .where(and(eq(articleRelations.articleId, id), isNull(articles.deletedAt)))
        .orderBy(asc(articleRelations.sortOrder));
    const secondaryRows = await db
        .select({ id: categories.id, slug: categories.slug, name: categories.name })
        .from(articleSecondaryCategories)
        .innerJoin(categories, eq(articleSecondaryCategories.categoryId, categories.id))
        .where(eq(articleSecondaryCategories.articleId, id))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
    const galleryRows = await db
        .select({
        id: articleGalleryItems.id,
        mediaId: articleGalleryItems.mediaId,
        caption: articleGalleryItems.caption,
        sortOrder: articleGalleryItems.sortOrder,
        altText: mediaAssets.altText,
        credit: mediaAssets.credit,
    })
        .from(articleGalleryItems)
        .innerJoin(mediaAssets, eq(articleGalleryItems.mediaId, mediaAssets.id))
        .where(eq(articleGalleryItems.articleId, id))
        .orderBy(asc(articleGalleryItems.sortOrder));
    return {
        ...row.article,
        categoryName: row.categoryName,
        categorySlug: row.categorySlug,
        authorId: row.article.authorUserId ?? '',
        authorName: row.authorName,
        editorName: row.editorName,
        approvedByName: row.approvedByName,
        publishedByName: row.publishedByName,
        coverUrl: row.coverFileId ? `/media/${row.coverFileId}/original` : null,
        coverThumbUrl: row.coverFileId ? `/media/${row.coverFileId}/thumb` : null,
        ogImageUrl: row.article.ogImageMediaId ? `/media/${row.article.ogImageMediaId}/original` : null,
        tags: tagRows,
        relatedArticles: relatedRows,
        secondaryCategories: secondaryRows,
        galleryItems: galleryRows.map((item) => ({
            ...item,
            url: `/media/${item.mediaId}/original`,
            thumbUrl: `/media/${item.mediaId}/thumb`,
        })),
    };
}
export async function createArticle(user, input) {
    requirePermission(user, PERMISSIONS.ARTICLES_CREATE);
    const [category] = await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
    if (!category)
        throw badRequest('INVALID_CATEGORY', 'Categoria inválida.');
    // Autor original = criador autenticado (não manipulável pelo cliente).
    const byline = resolveOriginalAuthor(user);
    const title = input.title.trim();
    const summary = (input.summary ?? '').trim() || 'Resumo pendente.';
    const contentHtml = sanitizeArticleHtml(input.contentHtml ?? '<p></p>');
    const id = newId();
    let slug = await allocateSlugFromTitle(title);
    let created = false;
    for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
        try {
            await db.insert(articles).values({
                id,
                slug,
                title,
                subtitle: input.subtitle?.trim() || null,
                summary,
                contentJson: input.contentJson ?? JSON.stringify({ type: 'doc', content: [] }),
                contentHtml,
                status: 'draft',
                categoryId: input.categoryId,
                authorUserId: byline.authorUserId,
                authorName: byline.authorName,
                seoTitle: title,
                seoDescription: summary.slice(0, 320),
                readingTimeMinutes: readingTimeFromHtml(contentHtml),
                createdByUserId: user.id,
                updatedByUserId: user.id,
                editorUserId: user.id,
            });
            created = true;
        }
        catch (error) {
            if (!isDuplicateSlugError(error) || attempt === 7)
                throw error;
            slug = await allocateSlugFromTitle(title);
        }
    }
    await writeAuditLog({
        actorUserId: user.id,
        action: 'article.create',
        entityType: 'article',
        entityId: id,
    });
    return getArticle(id);
}
export async function updateArticle(user, id, input, opts) {
    const lenient = opts?.lenient ?? false;
    const current = await getArticle(id);
    if (!canEditArticle(user, current))
        throw forbidden();
    if (current.version !== input.version) {
        throw conflict('VERSION_CONFLICT', 'O artigo foi alterado por outra pessoa. Recarregue e tente novamente.');
    }
    if (['published', 'scheduled'].includes(current.status) && !user.permissions.includes(PERMISSIONS.ARTICLES_PUBLISH)) {
        throw forbidden('Sem permissão para editar artigos publicados ou agendados.');
    }
    const nextTitle = input.title?.trim() ?? current.title;
    const nextSummary = input.summary?.trim() ?? current.summary;
    // Slug gerido pelo sistema: regenera só quando o título muda; preserva URL se o base for o mesmo.
    let nextSlug = current.slug;
    if (nextTitle !== current.title) {
        const base = slugify(nextTitle);
        if (!base)
            throw badRequest('INVALID_SLUG', 'O título não produz um slug válido.');
        if (isReservedSlug(base)) {
            throw badRequest('RESERVED_SLUG', 'Este título gera um slug reservado. Altere o título.');
        }
        const currentBase = slugify(current.title);
        if (base !== currentBase) {
            nextSlug = ensureUniqueSlug(base, await existingSlugs(id), new Date().getFullYear());
        }
    }
    const contentHtml = input.contentHtml !== undefined
        ? sanitizeArticleHtml(input.contentHtml)
        : current.contentHtml;
    // Autor original imutável — apenas actualiza o nome apresentado se a conta ainda existir.
    const byline = await keepCurrentByline(current.authorUserId, current.authorName);
    let nextFeatured = input.featured ?? current.featured;
    let nextHighlight = input.highlight ?? current.highlight;
    if (input.featured === true && input.highlight === true) {
        throw badRequest('CLASSIFICATION_EXCLUSIVE', 'Um artigo não pode ser simultaneamente «Notícia em destaque» e «Notícias secundárias».');
    }
    if (input.featured === true)
        nextHighlight = false;
    if (input.highlight === true)
        nextFeatured = false;
    if (nextFeatured && nextHighlight) {
        throw badRequest('CLASSIFICATION_EXCLUSIVE', 'Um artigo não pode ser simultaneamente «Notícia em destaque» e «Notícias secundárias».');
    }
    // SEO: acompanha título/resumo enquanto não houver personalização explícita.
    let nextSeoTitle = input.seoTitle === undefined ? current.seoTitle : input.seoTitle?.trim() || null;
    let nextSeoDescription = input.seoDescription === undefined
        ? current.seoDescription
        : input.seoDescription?.trim() || null;
    if (input.seoTitle === undefined && isSeoTitleAutomatic(current.seoTitle, current.title)) {
        nextSeoTitle = nextTitle;
    }
    if (input.seoDescription === undefined &&
        isSeoDescriptionAutomatic(current.seoDescription, current.summary)) {
        nextSeoDescription = nextSummary.slice(0, 320);
    }
    const nextCategoryId = input.categoryId ?? current.categoryId;
    if (input.categoryId && input.categoryId !== current.categoryId) {
        const [category] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.id, input.categoryId))
            .limit(1);
        if (!category)
            throw badRequest('INVALID_CATEGORY', 'Categoria inválida.');
    }
    const previousSlug = current.slug;
    await db.transaction(async (tx) => {
        const mediaToCheck = [input.coverMediaId, input.ogImageMediaId].filter((value) => Boolean(value));
        await assertMediaExists(tx, mediaToCheck);
        await prepareHomepageSlotChanges(tx, {
            articleId: id,
            wantFeatured: nextFeatured,
            wantSecondary: nextHighlight,
            releaseIds: input.releaseHomepageSlotIds,
        });
        const [result] = await tx
            .update(articles)
            .set({
            title: nextTitle,
            subtitle: input.subtitle === undefined ? current.subtitle : input.subtitle,
            summary: nextSummary,
            categoryId: nextCategoryId,
            authorUserId: byline.authorUserId,
            authorName: byline.authorName,
            contentJson: input.contentJson ?? current.contentJson,
            contentHtml,
            coverMediaId: input.coverMediaId === undefined ? current.coverMediaId : input.coverMediaId,
            coverAlt: input.coverAlt === undefined ? current.coverAlt : input.coverAlt,
            coverCaption: input.coverCaption === undefined ? current.coverCaption : input.coverCaption,
            featured: nextFeatured,
            highlight: nextHighlight,
            seoTitle: nextSeoTitle,
            seoDescription: nextSeoDescription,
            noindex: input.noindex ?? current.noindex,
            credits: input.credits === undefined ? current.credits : input.credits,
            sources: input.sources === undefined ? current.sources : input.sources?.trim() || null,
            location: input.location === undefined ? current.location : input.location?.trim() || null,
            ogImageMediaId: input.ogImageMediaId === undefined ? current.ogImageMediaId : input.ogImageMediaId,
            slug: nextSlug,
            readingTimeMinutes: readingTimeFromHtml(contentHtml),
            version: current.version + 1,
            updatedByUserId: user.id,
            editorUserId: user.id,
        })
            .where(and(eq(articles.id, id), eq(articles.version, current.version)));
        if (result.affectedRows === 0) {
            throw conflict('VERSION_CONFLICT', 'O artigo foi alterado por outra pessoa. Recarregue e tente novamente.');
        }
        await enforceHomepageSlotLimits(tx, {
            wantFeatured: nextFeatured,
            wantSecondary: nextHighlight,
        });
        if (input.coverMediaId !== undefined) {
            await syncCoverUsage(tx, id, input.coverMediaId);
        }
        if (input.ogImageMediaId !== undefined) {
            await syncOgUsage(tx, id, input.ogImageMediaId);
        }
        await syncTags(tx, id, input.tags);
        await syncRelations(tx, id, input.relatedArticleIds, lenient);
        // A categoria principal nunca deve constar também como secundária.
        if (input.secondaryCategoryIds !== undefined) {
            await syncSecondaryCategories(tx, id, nextCategoryId, input.secondaryCategoryIds, lenient);
        }
        else if (nextCategoryId !== current.categoryId) {
            await tx
                .delete(articleSecondaryCategories)
                .where(and(eq(articleSecondaryCategories.articleId, id), eq(articleSecondaryCategories.categoryId, nextCategoryId)));
        }
        await syncGallery(tx, id, input.galleryItems, lenient);
    });
    if (nextSlug !== previousSlug && ['published', 'scheduled'].includes(current.status)) {
        await upsertInternalRedirect(`/${previousSlug}`, `/${nextSlug}`);
    }
    await saveArticleRevision(id, current.version, buildArticleSnapshot(current), user.id, 'Edição');
    await writeAuditLog({
        actorUserId: user.id,
        action: 'article.update',
        entityType: 'article',
        entityId: id,
        meta: { version: current.version + 1 },
    });
    return getArticle(id);
}
export async function transitionArticle(user, id, action, opts) {
    const current = await getArticle(id);
    if (opts?.version != null && opts.version !== current.version) {
        throw conflict('VERSION_CONFLICT', 'Versão desactualizada.');
    }
    const next = TRANSITIONS[current.status]?.[action];
    if (!next) {
        throw badRequest('INVALID_TRANSITION', `Acção «${action}» inválida no estado «${current.status}».`);
    }
    if (action === 'submit') {
        requirePermission(user, PERMISSIONS.ARTICLES_SUBMIT);
        if (!canEditArticle(user, current))
            throw forbidden();
    }
    if (action === 'approve' || action === 'return' || action === 'reject') {
        requirePermission(user, PERMISSIONS.ARTICLES_APPROVE);
    }
    if (action === 'publish')
        requirePermission(user, PERMISSIONS.ARTICLES_PUBLISH);
    if (action === 'schedule')
        requirePermission(user, PERMISSIONS.ARTICLES_SCHEDULE);
    if (action === 'archive' || action === 'restore') {
        if (!canEditArticle(user, current) && !user.permissions.includes(PERMISSIONS.ARTICLES_PUBLISH)) {
            throw forbidden();
        }
    }
    if (action === 'submit' || action === 'publish' || action === 'schedule') {
        if (!current.title.trim()) {
            throw badRequest('TITLE_REQUIRED', 'O título é obrigatório.');
        }
        if (!current.summary.trim()) {
            throw badRequest('SUMMARY_REQUIRED', 'O resumo é obrigatório.');
        }
    }
    if (action === 'publish' || action === 'schedule') {
        const plain = current.contentHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
        if (!plain) {
            throw badRequest('CONTENT_REQUIRED', 'O corpo do artigo está vazio.');
        }
        if (!current.seoTitle?.trim() || !current.seoDescription?.trim()) {
            throw badRequest('SEO_REQUIRED', 'Título e descrição SEO são obrigatórios para publicar ou agendar.');
        }
        if (!current.coverMediaId) {
            throw badRequest('COVER_REQUIRED', 'Imagem de destaque obrigatória para publicar ou agendar.');
        }
    }
    let scheduledAt = current.scheduledAt;
    let publishedAt = current.publishedAt;
    let archivedAt = current.archivedAt;
    if (action === 'schedule') {
        if (!opts?.scheduledAt)
            throw badRequest('SCHEDULE_REQUIRED', 'Indique a data de publicação.');
        const when = new Date(opts.scheduledAt);
        if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
            throw badRequest('SCHEDULE_INVALID', 'A data de agendamento deve ser futura.');
        }
        scheduledAt = when;
    }
    if (action === 'publish') {
        publishedAt = new Date();
        scheduledAt = null;
    }
    if (action === 'archive')
        archivedAt = new Date();
    if (action === 'restore')
        archivedAt = null;
    await db
        .update(articles)
        .set({
        status: next,
        scheduledAt,
        publishedAt,
        archivedAt,
        version: current.version + 1,
        updatedByUserId: user.id,
        ...(action === 'approve' ? { approvedByUserId: user.id } : {}),
        ...(action === 'return' || action === 'reject' ? { approvedByUserId: null } : {}),
        ...(action === 'publish' || action === 'schedule' ? { publishedByUserId: user.id } : {}),
    })
        .where(eq(articles.id, id));
    await writeAuditLog({
        actorUserId: user.id,
        action: `article.${action}`,
        entityType: 'article',
        entityId: id,
        meta: { from: current.status, to: next },
    });
    await notifyArticleTransition(user, current, action, current.version + 1);
    return getArticle(id);
}
async function notifyArticleTransition(user, article, action, version) {
    const base = {
        entityType: 'article',
        entityId: article.id,
        excludeUserId: user.id,
        dedupeKey: `article:${article.id}:${action}:${version}`,
    };
    if (action === 'submit') {
        await notifyUsersWithPermissionSafe({
            ...base,
            permission: PERMISSIONS.ARTICLES_APPROVE,
            type: 'article.submitted',
            title: 'Artigo submetido para revisão',
            body: `«${article.title}» aguarda revisão editorial.`,
        });
        return;
    }
    if (action === 'approve') {
        await notifyUsersWithPermissionSafe({
            ...base,
            permission: PERMISSIONS.ARTICLES_PUBLISH,
            type: 'article.approved',
            title: 'Artigo aprovado',
            body: `«${article.title}» está pronto para publicação.`,
        });
    }
    if (action === 'publish') {
        await notifyUsersWithPermissionSafe({
            ...base,
            permission: PERMISSIONS.ARTICLES_APPROVE,
            type: 'article.published',
            title: 'Artigo publicado',
            body: `«${article.title}» foi publicado.`,
        });
    }
    const authorNotice = {
        return: { type: 'article.returned', title: 'Artigo devolvido para correcção', severity: 'warning' },
        reject: { type: 'article.rejected', title: 'Artigo rejeitado', severity: 'warning' },
        approve: { type: 'article.approved', title: 'O seu artigo foi aprovado' },
        publish: { type: 'article.published', title: 'O seu artigo foi publicado' },
    };
    const notice = authorNotice[action];
    if (!notice)
        return;
    const recipients = new Set([article.createdByUserId, article.authorUserId].filter((id) => Boolean(id) && id !== user.id));
    for (const userId of recipients) {
        try {
            await createNotification({
                userId,
                type: notice.type,
                title: notice.title,
                body: `«${article.title}»`,
                entityType: 'article',
                entityId: article.id,
                severity: notice.severity,
                dedupeKey: `article:${article.id}:${action}:${version}:author:${userId}`,
            });
        }
        catch {
            continue;
        }
    }
}
export async function softDeleteArticle(user, id) {
    const current = await getArticle(id);
    if (!user.permissions.includes(PERMISSIONS.ARTICLES_PUBLISH) && !canEditArticle(user, current)) {
        throw forbidden();
    }
    await db
        .update(articles)
        .set({ deletedAt: new Date(), updatedByUserId: user.id, version: current.version + 1 })
        .where(eq(articles.id, id));
    await writeAuditLog({
        actorUserId: user.id,
        action: 'article.delete',
        entityType: 'article',
        entityId: id,
    });
    return { ok: true };
}
export async function duplicateArticle(user, id) {
    requirePermission(user, PERMISSIONS.ARTICLES_CREATE);
    const source = await getArticle(id);
    const copy = await createArticle(user, {
        title: `${source.title} (cópia)`,
        summary: source.summary,
        categoryId: source.categoryId,
        subtitle: source.subtitle ?? undefined,
        contentJson: source.contentJson,
        contentHtml: source.contentHtml,
    });
    return updateArticle(user, copy.id, {
        version: copy.version,
        coverMediaId: source.coverMediaId,
        coverAlt: source.coverAlt,
        coverCaption: source.coverCaption,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        noindex: source.noindex,
        credits: source.credits,
        tags: source.tags.map((tag) => tag.name),
        sources: source.sources,
        location: source.location,
        ogImageMediaId: source.ogImageMediaId,
        relatedArticleIds: source.relatedArticles.map((item) => item.id),
        secondaryCategoryIds: source.secondaryCategories.map((item) => item.id),
        galleryItems: source.galleryItems.map((item) => ({
            mediaId: item.mediaId,
            caption: item.caption,
            sortOrder: item.sortOrder,
        })),
    }, { lenient: true });
}
const MAX_BATCH = 100;
/**
 * Acção em lote sobre artigos. Cada artigo é processado individualmente com as
 * mesmas verificações de permissão e regras de transição que as rotas unitárias;
 * falhas num artigo não impedem os restantes.
 */
export async function batchUpdateArticles(user, input) {
    const ids = [...new Set(input.ids)];
    if (!ids.length)
        throw badRequest('BATCH_EMPTY', 'Seleccione pelo menos um artigo.');
    if (ids.length > MAX_BATCH) {
        throw badRequest('BATCH_TOO_LARGE', `Máximo de ${MAX_BATCH} artigos por operação.`);
    }
    if (!user.permissions.includes(PERMISSIONS.ARTICLES_EDIT_ANY) &&
        !user.permissions.includes(PERMISSIONS.ARTICLES_EDIT_OWN) &&
        !user.permissions.includes(PERMISSIONS.ARTICLES_PUBLISH)) {
        throw forbidden();
    }
    let category;
    if (input.action === 'setCategory') {
        if (!input.categoryId)
            throw badRequest('CATEGORY_REQUIRED', 'Indique a categoria de destino.');
        [category] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.id, input.categoryId))
            .limit(1);
        if (!category)
            throw badRequest('INVALID_CATEGORY', 'Categoria inválida.');
    }
    if (input.action === 'setStatus') {
        if (!input.status || !ARTICLE_STATUSES.has(input.status)) {
            throw badRequest('INVALID_STATUS', 'Estado inválido.');
        }
    }
    const results = [];
    for (const id of ids) {
        try {
            if (input.action === 'archive') {
                await transitionArticle(user, id, 'archive');
            }
            else if (input.action === 'setStatus') {
                const current = await getArticle(id);
                const target = input.status;
                if (current.status === target) {
                    results.push({ id, ok: true });
                    continue;
                }
                const transitions = TRANSITIONS[current.status];
                const step = Object.entries(transitions).find(([, next]) => next === target);
                if (!step) {
                    throw badRequest('INVALID_TRANSITION', `Não é possível passar de «${current.status}» para «${target}».`);
                }
                await transitionArticle(user, id, step[0]);
            }
            else {
                await setArticleCategory(user, id, category.id);
            }
            results.push({ id, ok: true });
        }
        catch (error) {
            results.push({
                id,
                ok: false,
                error: error instanceof AppError ? error.message : 'Erro inesperado ao processar o artigo.',
            });
        }
    }
    const succeeded = results.filter((item) => item.ok).length;
    await writeAuditLog({
        actorUserId: user.id,
        action: 'article.batch',
        entityType: 'article',
        meta: {
            action: input.action,
            categoryId: input.categoryId,
            status: input.status,
            requested: ids.length,
            succeeded,
        },
    });
    return { total: ids.length, succeeded, failed: ids.length - succeeded, results };
}
async function setArticleCategory(user, id, categoryId) {
    const current = await getArticle(id);
    if (!canEditArticle(user, current))
        throw forbidden();
    if (['published', 'scheduled'].includes(current.status) &&
        !user.permissions.includes(PERMISSIONS.ARTICLES_PUBLISH)) {
        throw forbidden('Sem permissão para editar artigos publicados ou agendados.');
    }
    if (current.categoryId === categoryId)
        return;
    await db.transaction(async (tx) => {
        const [result] = await tx
            .update(articles)
            .set({
            categoryId,
            version: current.version + 1,
            updatedByUserId: user.id,
            editorUserId: user.id,
        })
            .where(and(eq(articles.id, id), eq(articles.version, current.version)));
        if (result.affectedRows === 0) {
            throw conflict('VERSION_CONFLICT', 'O artigo foi alterado por outra pessoa.');
        }
        await tx
            .delete(articleSecondaryCategories)
            .where(and(eq(articleSecondaryCategories.articleId, id), eq(articleSecondaryCategories.categoryId, categoryId)));
    });
    await saveArticleRevision(id, current.version, buildArticleSnapshot(current), user.id, 'Edição em lote');
    await writeAuditLog({
        actorUserId: user.id,
        action: 'article.update',
        entityType: 'article',
        entityId: id,
        meta: { version: current.version + 1, batch: 'setCategory', categoryId },
    });
}
export async function publishDueScheduled() {
    const due = await db
        .select({ id: articles.id, version: articles.version })
        .from(articles)
        .where(and(eq(articles.status, 'scheduled'), isNull(articles.deletedAt), sql `${articles.scheduledAt} <= UTC_TIMESTAMP(3)`))
        .limit(20);
    for (const item of due) {
        await db
            .update(articles)
            .set({
            status: 'published',
            publishedAt: new Date(),
            scheduledAt: null,
            version: item.version + 1,
        })
            .where(and(eq(articles.id, item.id), eq(articles.status, 'scheduled'), eq(articles.version, item.version)));
    }
    if (due.length) {
        const { invalidatePublicContent } = await import('../lib/cache.js');
        void invalidatePublicContent();
    }
    return due.length;
}
