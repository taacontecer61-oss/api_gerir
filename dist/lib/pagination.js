import { z } from 'zod';
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(50).default(20),
    q: z.string().optional(),
    status: z.string().optional(),
    categoryId: z.string().optional(),
    authorId: z.string().optional(),
    sort: z.enum(['updatedAt', 'publishedAt', 'title', 'createdAt']).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
});
export function paginateMeta(total, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    return {
        total,
        page: safePage,
        pageSize,
        totalPages,
    };
}
