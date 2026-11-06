/**
 * PM2 para VPS Hostinger. Uma instância: o próprio processo já faz cluster
 * quando WEB_CONCURRENCY > 1 no .env.
 */
module.exports = {
  apps: [
    {
      name: 'kwanza-news-api',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
