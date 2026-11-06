import { sql, count, eq } from 'drizzle-orm'
import { env } from '../src/config.js'
import { db, pool } from '../src/db/index.js'
import {
  authors,
  categories,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from '../src/db/schema/index.js'
import { verifyPassword } from '../src/lib/password.js'

async function main() {
  console.log('Config:', {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    database: env.DATABASE_NAME,
    user: env.DATABASE_USER,
  })

  await db.execute(sql`SELECT 1`)
  console.log('OK: ligação Drizzle/MySQL')

  const [tables] = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM information_schema.tables
    WHERE table_schema = ${env.DATABASE_NAME}
  `)
  console.log('OK: tabelas =', (tables as { total: number }).total ?? tables)

  const [roleCount] = await db.select({ total: count() }).from(roles)
  const [permCount] = await db.select({ total: count() }).from(permissions)
  const [catCount] = await db.select({ total: count() }).from(categories)
  const [authorCount] = await db.select({ total: count() }).from(authors)
  const [userCount] = await db.select({ total: count() }).from(users)
  const [rpCount] = await db.select({ total: count() }).from(rolePermissions)
  const [urCount] = await db.select({ total: count() }).from(userRoles)

  console.log('OK: contagens', {
    roles: roleCount.total,
    permissions: permCount.total,
    categories: catCount.total,
    authors: authorCount.total,
    users: userCount.total,
    rolePermissions: rpCount.total,
    userRoles: urCount.total,
  })

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, env.SEED_ADMIN_EMAIL.toLowerCase()))
    .limit(1)

  if (!admin) {
    throw new Error('Admin seed não encontrado')
  }

  const passwordOk = await verifyPassword(admin.passwordHash, env.SEED_ADMIN_PASSWORD)
  if (!passwordOk) {
    throw new Error('Password do admin não valida contra o hash')
  }
  console.log('OK: utilizador admin e password')

  if (Number(catCount.total) !== 8) throw new Error('Esperava 8 categorias')
  if (Number(roleCount.total) < 6) throw new Error('Esperava pelo menos 6 funções')
  if (Number(permCount.total) < 17) throw new Error('Esperava pelo menos 17 permissões')
  if (Number(urCount.total) < 1) throw new Error('Admin sem função')

  console.log('RESULTADO: base de dados conectada e a funcionar correctamente')
  await pool.end()
}

main().catch(async (error) => {
  console.error('RESULTADO: FALHA', error)
  await pool.end().catch(() => undefined)
  process.exit(1)
})
