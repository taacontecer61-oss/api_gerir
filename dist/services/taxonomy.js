import { asc, count, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { articleTags, categories, tags } from '../db/schema/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { slugify } from '../lib/slugify.js';
import { writeAuditLog } from './audit.js';
export async function listCategories() {
    return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}
export async function createCategory(input, actorUserId) {
    const name = input.name.trim();
    if (name.length < 2)
        throw badRequest('INVALID_NAME', 'Nome da categoria obrigatório.');
    const slug = slugify(input.slug?.trim() || name);
    if (!slug)
        throw badRequest('INVALID_SLUG', 'Slug inválido.');
    const [existing] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    if (existing)
        throw conflict('CATEGORY_EXISTS', 'Já existe uma categoria com este slug.');
    const [maxRow] = await db
        .select({ max: sql `COALESCE(MAX(${categories.sortOrder}), 0)` })
        .from(categories);
    const sortOrder = input.sortOrder ?? Number(maxRow?.max ?? 0) + 1;
    const id = newId();
    await db.insert(categories).values({
        id,
        slug,
        name,
        description: input.description?.trim() || null,
        seoTitle: input.seoTitle?.trim() || null,
        seoDescription: input.seoDescription?.trim() || null,
        sortOrder,
        isActive: input.isActive ?? true,
    });
    await writeAuditLog({
        actorUserId,
        action: 'category.create',
        entityType: 'category',
        entityId: id,
    });
    const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return row;
}
export async function updateCategory(id, input, actorUserId) {
    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing)
        throw notFound('Categoria não encontrada.');
    await db
        .update(categories)
        .set({
        name: input.name?.trim() ?? existing.name,
        description: input.description === undefined ? existing.description : input.description,
        seoTitle: input.seoTitle === undefined ? existing.seoTitle : input.seoTitle?.trim() || null,
        seoDescription: input.seoDescription === undefined
            ? existing.seoDescription
            : input.seoDescription?.trim() || null,
        isActive: input.isActive ?? existing.isActive,
        sortOrder: input.sortOrder ?? existing.sortOrder,
    })
        .where(eq(categories.id, id));
    await writeAuditLog({
        actorUserId,
        action: 'category.update',
        entityType: 'category',
        entityId: id,
    });
    const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return row;
}
export async function listTags(q) {
    const rows = await db.select().from(tags).orderBy(asc(tags.name));
    if (!q?.trim())
        return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => row.name.toLowerCase().includes(needle));
}
export async function createTag(name, actorUserId) {
    const trimmed = name.trim();
    if (!trimmed)
        throw badRequest('INVALID_TAG', 'Nome da etiqueta obrigatório.');
    const slug = slugify(trimmed);
    const [existing] = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
    if (existing)
        throw conflict('TAG_EXISTS', 'Etiqueta já existe.');
    const id = newId();
    await db.insert(tags).values({ id, name: trimmed, slug });
    await writeAuditLog({
        actorUserId,
        action: 'tag.create',
        entityType: 'tag',
        entityId: id,
    });
    const [row] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    return row;
}
export async function deleteTag(id, actorUserId) {
    const [existing] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    if (!existing)
        throw notFound('Etiqueta não encontrada.');
    const [usage] = await db
        .select({ total: count() })
        .from(articleTags)
        .where(eq(articleTags.tagId, id));
    if (Number(usage?.total ?? 0) > 0) {
        throw conflict('TAG_IN_USE', 'Esta etiqueta está associada a artigos e não pode ser eliminada.');
    }
    await db.delete(tags).where(eq(tags.id, id));
    await writeAuditLog({
        actorUserId,
        action: 'tag.delete',
        entityType: 'tag',
        entityId: id,
    });
    return { ok: true };
}
