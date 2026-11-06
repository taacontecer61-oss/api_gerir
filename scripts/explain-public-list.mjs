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

const [rows] = await connection.query(
  "EXPLAIN SELECT id FROM articles WHERE status = 'published' AND deleted_at IS NULL AND published_at <= UTC_TIMESTAMP(3) ORDER BY published_at DESC LIMIT 12",
)
console.log(JSON.stringify(rows, null, 2))
await connection.end()
