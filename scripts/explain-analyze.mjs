import { config } from 'dotenv'
import mysql from 'mysql2/promise'

config()

const connection = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
})

async function plan(label, sql) {
  const [explain] = await connection.query(`EXPLAIN ${sql}`)
  let analyze = null
  try {
    const [rows] = await connection.query(`EXPLAIN ANALYZE ${sql}`)
    analyze = rows
  } catch (error) {
    analyze = { error: error.message }
  }
  console.log(`\n## ${label}`)
  console.log(JSON.stringify({ explain, analyze }, null, 2))
}

await plan(
  'public-list',
  "SELECT id FROM articles WHERE status = 'published' AND deleted_at IS NULL AND published_at <= UTC_TIMESTAMP(3) ORDER BY published_at DESC LIMIT 12",
)
await plan(
  'fulltext',
  "SELECT id FROM articles WHERE MATCH(title, subtitle, summary) AGAINST ('angola*' IN BOOLEAN MODE) AND status = 'published' AND deleted_at IS NULL LIMIT 12",
)
await connection.end()
