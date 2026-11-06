import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../config.js';
import * as schema from './schema/index.js';
const pool = mysql.createPool({
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    waitForConnections: true,
    connectionLimit: env.DATABASE_POOL_SIZE,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 100,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    namedPlaceholders: true,
    timezone: 'Z',
});
export const db = drizzle(pool, { schema, mode: 'default' });
export { pool };
