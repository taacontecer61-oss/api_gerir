import { pool } from '../src/db/index.js'

async function main() {
  const [create] = await pool.query('SHOW CREATE TABLE live_coverages')
  console.log((create as Array<{ 'Create Table': string }>)[0]['Create Table'])

  console.log('Dropping partial 0002 tables…')
  await pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of [
    'live_coverage_updates',
    'live_coverages',
    'notifications',
    'notification_preferences',
    'page_view_daily',
    'page_view_sessions',
  ]) {
    await pool.query(`DROP TABLE IF EXISTS \`${table}\``)
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1')
  console.log('Dropped. Re-run npm run db:migrate after fixing SQL charset.')
  await pool.end()
}

main().catch(async (e) => {
  console.error(e)
  await pool.end()
  process.exit(1)
})
