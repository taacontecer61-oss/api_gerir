import cluster from 'node:cluster';
import { env } from './config.js';
import { pool } from './db/index.js';
import { buildApp } from './app.js';
async function main(runJobs) {
    const app = await buildApp({ runJobs });
    const shutdown = async (signal) => {
        app.log.info({ signal }, 'A encerrar…');
        await app.close();
        await pool.end();
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info(`API Kwanza News em http://${env.HOST}:${env.PORT}`);
}
const workers = env.WEB_CONCURRENCY;
if (workers > 1 && cluster.isPrimary) {
    for (let index = 0; index < workers; index += 1)
        cluster.fork();
    cluster.on('exit', () => {
        cluster.fork();
    });
}
else {
    const runJobs = workers === 1 || cluster.worker?.id === 1;
    main(runJobs).catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
