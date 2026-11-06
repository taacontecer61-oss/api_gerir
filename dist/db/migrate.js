import { migrate } from 'drizzle-orm/mysql2/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './index.js';
const root = dirname(fileURLToPath(import.meta.url));
async function main() {
    await migrate(db, { migrationsFolder: resolve(root, '../../drizzle') });
    console.log('Migrações aplicadas.');
    await pool.end();
}
main().catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
});
