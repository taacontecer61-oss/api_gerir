/**
 * Smoke test: autor original, slug, SEO, classificação exclusiva e limites homepage.
 * Requer API a correr e base migrada/seeded.
 */
import { env } from '../src/config.js'

const base = `http://127.0.0.1:${env.PORT}`

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Resposta inválida (${res.status}): ${text.slice(0, 200)}`)
  }
}

async function main() {
  const loginRes = await fetch(`${base}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
    }),
  })
  assert(loginRes.ok, `Login falhou: ${loginRes.status}`)
  const cookie =
    loginRes.headers.getSetCookie?.()[0]?.split(';')[0] ||
    loginRes.headers.get('set-cookie')?.split(';')[0]
  assert(cookie, 'Sem cookie de sessão')
  const auth = { cookie, 'content-type': 'application/json' }

  const cats = (await fetch(`${base}/api/admin/categories`, { headers: auth }).then((r) =>
    r.json(),
  )) as Array<{ id: string; slug: string }>
  assert(cats[0]?.id, 'Faltam categorias no seed')
  const categoryId = cats[0].id
  const stamp = Date.now()

  // 1) Criação: autor original = sessão; SEO automático; slug automático
  const createRes = await fetch(`${base}/api/admin/articles`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: `Economia Angola Smoke ${stamp}`,
      summary: `Resumo smoke ${stamp}`,
      categoryId,
      authorId: '00000000-0000-4000-8000-000000000099', // deve ser ignorado
    }),
  })
  if (!createRes.ok) throw new Error(`Criar artigo falhou: ${createRes.status} ${await createRes.text()}`)
  const article = await json<{
    id: string
    slug: string
    authorId: string
    authorName: string
    seoTitle: string | null
    seoDescription: string | null
    version: number
    title: string
    summary: string
  }>(createRes)

  const me = (await fetch(`${base}/api/admin/session`, { headers: auth }).then((r) => r.json())) as {
    user?: { id: string; name: string }
  }
  assert(me.user?.id, 'Sessão sem utilizador')
  assert(article.authorId === me.user.id, 'Autor original deve ser o utilizador autenticado')
  assert(article.seoTitle === article.title, 'SEO title deve iniciar igual ao título')
  assert(article.seoDescription === article.summary, 'SEO description deve iniciar igual ao resumo')
  assert(article.slug.startsWith('economia-angola-smoke-'), `Slug inesperado: ${article.slug}`)

  // 2) Slug manual ignorado; autor não muda
  const patchIgnore = await fetch(`${base}/api/admin/articles/${article.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({
      version: article.version,
      slug: 'slug-forjado-pelo-cliente',
      authorId: '00000000-0000-4000-8000-000000000099',
      title: article.title,
    }),
  })
  if (!patchIgnore.ok) throw new Error(`PATCH ignore falhou: ${await patchIgnore.text()}`)
  const afterIgnore = await json<typeof article>(patchIgnore)
  assert(afterIgnore.slug === article.slug, 'Slug não pode ser forjado pelo cliente')
  assert(afterIgnore.authorId === article.authorId, 'Autor original não pode mudar')

  // 3) Unicidade de slug
  const createDup = await fetch(`${base}/api/admin/articles`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: `Economia Angola Smoke ${stamp}`,
      summary: 'outro',
      categoryId,
    }),
  })
  if (!createDup.ok) throw new Error(`Criar duplicado falhou: ${await createDup.text()}`)
  const dup = await json<{ id: string; slug: string }>(createDup)
  assert(dup.slug !== afterIgnore.slug, 'Slugs duplicados não são permitidos')
  assert(
    dup.slug === `${afterIgnore.slug.replace(/-\d{4}$/, '')}-2` ||
      dup.slug.endsWith('-2') ||
      dup.slug.includes('-2') ||
      dup.slug !== afterIgnore.slug,
    `Slug único esperado, obtido ${dup.slug}`,
  )

  // 4) Exclusividade featured/highlight
  let version = afterIgnore.version
  const both = await fetch(`${base}/api/admin/articles/${article.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ version, featured: true, highlight: true }),
  })
  assert(both.status === 400, 'Deveria rejeitar featured+highlight')
  const bothBody = await json<{ error?: { code?: string } }>(both)
  assert(bothBody.error?.code === 'VALIDATION_ERROR' || bothBody.error?.code === 'CLASSIFICATION_EXCLUSIVE')

  // 5) Limites: preencher secundárias até 3 e tentar a 4.ª
  const slotsBefore = await json<{
    secondary: { limit: number; items: Array<{ id: string }> }
    featured: { limit: number; items: Array<{ id: string }> }
  }>(await fetch(`${base}/api/admin/articles/homepage-slots`, { headers: auth }))
  assert(slotsBefore.featured.limit === 8, 'Limite featured deve ser 8')
  assert(slotsBefore.secondary.limit === 3, 'Limite secondary deve ser 3')

  const secondaryIds: string[] = []
  for (let i = 0; i < 3; i += 1) {
    const created = await json<{ id: string; version: number }>(
      await fetch(`${base}/api/admin/articles`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          title: `Secundaria slot ${stamp}-${i}`,
          summary: 'slot',
          categoryId,
        }),
      }),
    )
    const updated = await fetch(`${base}/api/admin/articles/${created.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ version: created.version, highlight: true }),
    })
    if (!updated.ok) {
      // Já podia estar no limite por dados existentes — libertar e repetir
      const slots = await json<{ secondary: { items: Array<{ id: string; version?: number }> } }>(
        await fetch(`${base}/api/admin/articles/homepage-slots`, { headers: auth }),
      )
      for (const item of slots.secondary.items.slice(0, 1)) {
        const current = await json<{ version: number }>(
          await fetch(`${base}/api/admin/articles/${item.id}`, { headers: auth }),
        )
        await fetch(`${base}/api/admin/articles/${item.id}`, {
          method: 'PATCH',
          headers: auth,
          body: JSON.stringify({ version: current.version, highlight: false }),
        })
      }
      const retry = await fetch(`${base}/api/admin/articles/${created.id}`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ version: created.version, highlight: true }),
      })
      if (!retry.ok) throw new Error(`Não foi possível classificar secundária: ${await retry.text()}`)
    }
    secondaryIds.push(created.id)
  }

  // Garantir exactamente 3 secundárias activas (pode haver extras de seeds)
  let slotsNow = await json<{ secondary: { items: Array<{ id: string }> } }>(
    await fetch(`${base}/api/admin/articles/homepage-slots`, { headers: auth }),
  )
  while (slotsNow.secondary.items.length > 3) {
    const extra = slotsNow.secondary.items.find((item) => !secondaryIds.includes(item.id))
      || slotsNow.secondary.items[0]
    const current = await json<{ version: number }>(
      await fetch(`${base}/api/admin/articles/${extra.id}`, { headers: auth }),
    )
    await fetch(`${base}/api/admin/articles/${extra.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ version: current.version, highlight: false }),
    })
    slotsNow = await json(await fetch(`${base}/api/admin/articles/homepage-slots`, { headers: auth }))
  }

  // Recarregar version do artigo principal
  const fresh = await json<{ version: number }>(
    await fetch(`${base}/api/admin/articles/${article.id}`, { headers: auth }),
  )
  version = fresh.version

  const overflow = await fetch(`${base}/api/admin/articles/${article.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ version, highlight: true }),
  })
  assert(overflow.status === 409, 'Deveria rejeitar 4.ª secundária')
  const overflowBody = await json<{ error?: { code?: string; details?: { items?: unknown[] } } }>(
    overflow,
  )
  assert(overflowBody.error?.code === 'SECONDARY_LIMIT', 'Código SECONDARY_LIMIT esperado')
  assert(Array.isArray(overflowBody.error?.details?.items), 'Details com items esperado')

  // Libertação atómica + classificação
  const releaseId = slotsNow.secondary.items[0]?.id
  assert(releaseId, 'Precisa de um artigo para libertar')
  const claim = await fetch(`${base}/api/admin/articles/${article.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({
      version,
      highlight: true,
      releaseHomepageSlotIds: [releaseId],
    }),
  })
  if (!claim.ok) throw new Error(`Claim com release falhou: ${await claim.text()}`)
  const claimed = await json<{ highlight: boolean; featured: boolean; version: number }>(claim)
  assert(claimed.highlight === true && claimed.featured === false, 'Deveria ficar só secundária')

  // 6) Homepage pública
  const featuredPublic = await json<{
    featured: unknown[]
    highlights: unknown[]
    categoryHighlights?: Array<{ categorySlug: string; id: string }>
  }>(await fetch(`${base}/api/public/featured?limit=12`))
  assert(Array.isArray(featuredPublic.featured), 'featured público inválido')
  assert(Array.isArray(featuredPublic.highlights), 'highlights público inválido')
  assert(Array.isArray(featuredPublic.categoryHighlights), 'categoryHighlights em falta')
  const catsSeen = new Set(featuredPublic.categoryHighlights!.map((item) => item.categorySlug))
  assert(
    catsSeen.size === featuredPublic.categoryHighlights!.length,
    'Grelha de destaques não pode repetir categorias',
  )

  // Limpeza leve: remover classificação do artigo de teste
  await fetch(`${base}/api/admin/articles/${article.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ version: claimed.version, highlight: false, featured: false }),
  })

  console.log('smoke-editorial-articles: OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
