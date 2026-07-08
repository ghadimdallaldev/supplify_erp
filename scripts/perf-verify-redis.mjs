#!/usr/bin/env node
/**
 * Verify Redis / cache configuration without printing secrets.
 *
 * Usage:
 *   node scripts/perf-verify-redis.mjs
 *   API_URL=https://api-dev.supplifyerp.com node scripts/perf-verify-redis.mjs
 */

const API_URL = (process.env.API_URL || 'https://api-dev.supplifyerp.com').replace(/\/$/, '')

async function fetchJson(path) {
  const res = await fetch(`${API_URL}${path}`)
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function benchmarkAuthMe(token) {
  const durations = []
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    await res.text()
    durations.push(Math.round(performance.now() - start))
  }
  return durations
}

async function main() {
  const health = await fetchJson('/health')
  const ready = await fetchJson('/ready')

  console.log('=== Redis / cache verification ===')
  console.log(`API: ${API_URL}`)
  console.log(`Health status: ${health.status}`)
  console.log(`Redis in health payload: ${health.body.redis ? JSON.stringify(health.body.redis) : 'not exposed'}`)
  console.log(`DB pool in health: ${health.body.dbPool ? JSON.stringify(health.body.dbPool) : 'not exposed'}`)
  console.log(`Ready status: ${ready.status} (${ready.body.status})`)

  let authWarm = null
  try {
    const { getTokenForRole } = await import('../apps/api/scripts/lib/auth-token.mjs')
    const token = await getTokenForRole('restaurant')
    if (token) {
      const durations = await benchmarkAuthMe(token)
      authWarm = { durations, p50: durations[2], first: durations[0], last: durations[4] }
      console.log(`/auth/me repeat (5x): ${durations.join('ms, ')}ms`)
      console.log(
        `Cache warm hint: first=${durations[0]}ms last=${durations[4]}ms (lower last suggests warm auth caches)`
      )
    } else {
      console.log('/auth/me cache probe: skipped (no token)')
    }
  } catch (err) {
    console.log(`/auth/me cache probe: skipped (${err.message})`)
  }

  const out = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    health: {
      status: health.status,
      env: health.body.env,
      redis: health.body.redis ?? null,
      dbPool: health.body.dbPool ?? null,
    },
    ready: { status: ready.status, body: ready.body },
    authWarm,
  }

  const fs = await import('fs')
  const path = await import('path')
  const outPath = path.join(process.cwd(), 'docs/audits/performance/perf-redis-verification.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`Wrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
