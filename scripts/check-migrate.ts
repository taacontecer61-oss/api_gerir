import { pool } from '../src/db/index.js'

async function main() {
  const [cols] = await pool.query("SHOW FULL COLUMNS FROM categories WHERE Field = 'id'")
  console.log('categories.id', cols)

  const [authors] = await pool.query("SHOW FULL COLUMNS FROM authors WHERE Field = 'id'")
  console.log('authors.id', authors)

  const [tables] = await pool.query("SHOW TABLES")
  console.log(
    'tables',
    (tables as Array<Record<string, string>>).map((t) => Object.values(t)[0]),
  )

  try {
    const [mig] = await pool.query('SELECT id, hash, created_at FROM __drizzle_migrations')
    console.log('migrations', mig)
  } catch (e) {
    console.log('no migrations table', e)
  }

  await pool.end()
}

main().catch(async (e) => {
  console.error(e)
  await pool.end()
  process.exit(1)
})
