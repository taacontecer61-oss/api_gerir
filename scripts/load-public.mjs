const base = 'http://127.0.0.1:3001/api/public/articles?pageSize=12'
const total = 40

const started = performance.now()
const samples = await Promise.all(
  Array.from({ length: total }, async () => {
    const t0 = performance.now()
    const response = await fetch(base)
    await response.arrayBuffer()
    return { status: response.status, ms: performance.now() - t0 }
  }),
)
const elapsed = performance.now() - started
const times = samples.map((item) => item.ms).sort((a, b) => a - b)
const percentile = (p) => times[Math.min(times.length - 1, Math.floor((times.length - 1) * p))]
const failures = samples.filter((item) => item.status !== 200).length
console.log(
  JSON.stringify(
    {
      requests: total,
      failures,
      wallMs: Math.round(elapsed),
      p50: Math.round(percentile(0.5)),
      p95: Math.round(percentile(0.95)),
      max: Math.round(times.at(-1)),
    },
    null,
    2,
  ),
)
