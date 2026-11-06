import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
export const healthRoutes = async (app) => {
    app.get('/health', async () => {
        await db.execute(sql `SELECT 1`);
        return { ok: true, service: 'kwanza-news-api' };
    });
};
