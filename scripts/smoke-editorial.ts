/**
 * Smoke test integrado: login → criar cobertura live → publicar update → API pública.
 * Requer API a correr e base migrada/seeded.
 */
import { env } from '../src/config.js'

const base = `http://127.0.0.1:${env.PORT}`

async function main() {
  const loginRes = await fetch(`${base}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
    }),
  })
  if (!loginRes.ok) throw new Error(`Login falhou: ${loginRes.status}`)
  const cookie = loginRes.headers.getSetCookie?.()[0]?.split(';')[0]
    || loginRes.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Sem cookie de sessão')

  const auth = { cookie, 'content-type': 'application/json' }

  const cats = await fetch(`${base}/api/admin/categories`, { headers: auth }).then((r) => r.json())
  const categoryId = cats[0]?.id
  if (!categoryId) throw new Error('Faltam categorias no seed')

  const dash = await fetch(`${base}/api/admin/dashboard`, { headers: auth }).then((r) => r.json())
  if (typeof dash.totals?.published !== 'number') throw new Error('Dashboard inválido')

  const create = await fetch(`${base}/api/admin/live`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: `Smoke live ${Date.now()}`,
      summary: 'Cobertura de teste automatizado',
      categoryId,
    }),
  })
  if (!create.ok) throw new Error(`Criar live falhou: ${create.status} ${await create.text()}`)
  const coverage = await create.json()

  const start = await fetch(`${base}/api/admin/live/${coverage.id}/start`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ version: coverage.version }),
  })
  if (!start.ok) throw new Error(`Start live falhou: ${start.status} ${await start.text()}`)
  const live = await start.json()

  const upd = await fetch(`${base}/api/admin/live/${coverage.id}/updates`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: 'Actualização smoke',
      bodyHtml: '<p>Primeira actualização do teste.</p>',
      isImportant: true,
    }),
  })
  if (!upd.ok) throw new Error(`Criar update falhou: ${upd.status} ${await upd.text()}`)
  const update = await upd.json()

  const pub = await fetch(`${base}/api/admin/live/${coverage.id}/updates/${update.id}/publish`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ version: update.version }),
  })
  if (!pub.ok) throw new Error(`Publicar update falhou: ${pub.status} ${await pub.text()}`)

  const publicLive = await fetch(`${base}/api/public/live/${live.slug}`).then((r) => r.json())
  if (!publicLive?.slug || publicLive.status !== 'live') {
    throw new Error(`API pública não reflecte cobertura em directo: ${JSON.stringify(publicLive).slice(0, 200)}`)
  }
  if (!Array.isArray(publicLive.updates) || publicLive.updates.length < 1) {
    throw new Error('API pública sem actualizações publicadas')
  }

  const articles = await fetch(`${base}/api/public/articles`).then((r) => r.json())
  if (!('items' in articles)) throw new Error('Lista pública de artigos inválida')

  console.log('SMOKE OK', {
    coverageId: coverage.id,
    slug: live.slug,
    updates: publicLive.updates.length,
    publishedArticles: articles.total ?? articles.items?.length,
    dashboardPublished: dash.totals.published,
    liveActive: dash.totals.liveActive,
  })
}

main().catch((error) => {
  console.error('SMOKE FAIL', error)
  process.exit(1)
})
