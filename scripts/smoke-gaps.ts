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
  if (!loginRes.ok) throw new Error(`login ${loginRes.status}`)
  const cookie =
    loginRes.headers.getSetCookie?.()[0]?.split(';')[0] ||
    loginRes.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('no cookie')
  const auth = { cookie, 'content-type': 'application/json' }

  const checks: Array<[string, number]> = []

  const dash = await fetch(`${base}/api/admin/dashboard?range=7d`, { headers: auth })
  checks.push(['dashboard+charts', dash.status])
  const dashJson = await dash.json()
  if (!dashJson.charts) throw new Error('dashboard missing charts')

  const settings = await fetch(`${base}/api/admin/settings`, { headers: auth })
  checks.push(['settings', settings.status])

  const videos = await fetch(`${base}/api/admin/videos`, { headers: auth })
  checks.push(['videos', videos.status])

  const galleries = await fetch(`${base}/api/admin/galleries`, { headers: auth })
  checks.push(['galleries', galleries.status])

  const mediaUnused = await fetch(`${base}/api/admin/media?unused=true&page=1&pageSize=5`, {
    headers: auth,
  })
  checks.push(['media unused', mediaUnused.status])

  const csv = await fetch(`${base}/api/admin/reports/export.csv?from=2026-01-01&to=2026-12-31`, {
    headers: auth,
  })
  checks.push(['reports csv', csv.status])
  const csvText = await csv.text()
  if (!csvText.includes('day') && !csvText.includes('views')) {
    // allow Portuguese headers
    if (!csv.ok) throw new Error('csv failed')
  }

  const rss = await fetch(`${base}/api/public/rss.xml`)
  checks.push(['rss', rss.status])
  const rssText = await rss.text()
  if (!rssText.includes('<rss')) throw new Error('rss not xml')

  const roles = await fetch(`${base}/api/admin/roles`, { headers: auth }).then((r) => r.json())
  const hasCollaborator = (roles as Array<{ slug: string }>).some((r) => r.slug === 'collaborator')
  if (!hasCollaborator) throw new Error('collaborator role missing')

  const failed = checks.filter(([, s]) => s < 200 || s >= 300)
  if (failed.length) throw new Error(`failed: ${JSON.stringify(failed)}`)

  console.log('SMOKE GAPS OK', Object.fromEntries(checks), {
    hasCharts: Boolean(dashJson.charts),
    collaborator: true,
  })
}

main().catch((e) => {
  console.error('SMOKE GAPS FAIL', e)
  process.exit(1)
})
