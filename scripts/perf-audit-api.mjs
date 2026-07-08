#!/usr/bin/env node
/**
 * Performance audit harness — repeated latency sampling for critical API routes.
 *
 * Usage:
 *   node scripts/perf-audit-api.mjs
 *   API_URL=https://api-preprod.supplifyerp.com KEYCLOAK_URL=... KEYCLOAK_REALM=... node scripts/perf-audit-api.mjs
 *
 * Env: same token vars as apps/api/scripts/dev-api-smoke-test.mjs (SUPPLIFY_*_TOKEN or E2E_*)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getTokenForRole } from '../apps/api/scripts/lib/auth-token.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')
const OUT_JSON = path.join(REPO_ROOT, 'docs/audits/performance/perf-audit-api-results.json')
const OUT_MD = path.join(REPO_ROOT, 'docs/audits/performance/perf-audit-api-results.md')

const BASE_URL = (process.env.API_URL || process.env.SUPPLIFY_DEV_API_URL || 'http://localhost:4000').replace(
  /\/$/,
  ''
)
const SAMPLES = Math.max(1, parseInt(process.env.PERF_SAMPLES || '20', 10))
const WARMUP = Math.min(3, SAMPLES)

const BUDGETS = {
  standard: 500,
  heavy: 1500,
  auth: 800,
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function stats(durations) {
  const sorted = [...durations].sort((a, b) => a - b)
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
  }
}

async function fetchWithTiming(method, routePath, { role = null, body = null } = {}) {
  const url = `${BASE_URL}${routePath}`
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (role) {
    const token = await getTokenForRole(role)
    if (!token) throw new Error(`No token for role ${role}`)
    headers.Authorization = `Bearer ${token}`
  }
  const start = performance.now()
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const durationMs = Math.round(performance.now() - start)
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { status: res.status, durationMs, bytes: text.length, data }
}

async function benchmarkEndpoint(entry) {
  const { label, method = 'GET', path: routePath, role, budget = 'standard', body } = entry
  const durations = []
  let lastStatus = 0
  let lastBytes = 0
  let error = null

  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    try {
      const r = await fetchWithTiming(method, routePath, { role, body })
      lastStatus = r.status
      lastBytes = r.bytes
      if (i >= WARMUP) durations.push(r.durationMs)
      if (r.status >= 500) error = `HTTP ${r.status}`
    } catch (err) {
      error = err.message
      break
    }
  }

  const s = stats(durations)
  const budgetMs = BUDGETS[budget] ?? BUDGETS.standard
  const overBudget = s.p95 > budgetMs

  return {
    label,
    method,
    route: routePath,
    role,
    budget: budgetMs,
    status: lastStatus,
    bytes: lastBytes,
    ...s,
    overBudget,
    error,
    outcome: error ? 'ERROR' : lastStatus >= 200 && lastStatus < 400 ? 'OK' : 'FAIL',
  }
}

const ENDPOINTS = [
  { label: 'health', path: '/health', budget: 'standard' },
  { label: 'ready', path: '/ready', budget: 'standard' },
  { label: 'auth/me', path: '/auth/me', role: 'restaurant', budget: 'auth' },
  { label: 'orders-list-restaurant', path: '/api/orders?limit=20', role: 'restaurant', budget: 'standard' },
  {
    label: 'orders-list-no-items',
    path: '/api/orders?limit=20&includeItems=false',
    role: 'restaurant',
    budget: 'standard',
  },
  { label: 'products-supplier', path: '/api/products?limit=20', role: 'supplier', budget: 'standard' },
  { label: 'products-categories', path: '/api/products/categories', role: 'supplier', budget: 'standard' },
  { label: 'inventory-supplier', path: '/api/inventory?limit=100', role: 'supplier', budget: 'standard' },
  { label: 'orders-list-with-items', path: '/api/orders?limit=20&includeItems=true', role: 'restaurant', budget: 'standard' },
  { label: 'dashboard-stats', path: '/api/admin/dashboard', role: 'restaurant', budget: 'standard' },
  { label: 'billing-status', path: '/api/billing/status', role: 'restaurant', budget: 'standard' },
  { label: 'promotions-active', path: '/api/promotions/active', role: 'restaurant', budget: 'standard' },
  { label: 'quote-requests', path: '/api/quote-requests', role: 'restaurant', budget: 'standard' },
  { label: 'supplier-deliveries-board', path: '/api/supplier/deliveries/board', role: 'supplier', budget: 'heavy' },
  { label: 'supplier-reorder-intelligence', path: '/api/supplier/reorder-intelligence', role: 'supplier', budget: 'standard' },
  { label: 'restaurant-inventory-paged', path: '/api/restaurant-inventory?limit=100&offset=0', role: 'restaurant', budget: 'heavy' },
  { label: 'invoices-supplier', path: '/api/invoices?limit=50', role: 'supplier', budget: 'standard' },
  { label: 'fulfillment-dispatch', path: '/api/fulfillment/dispatch', role: 'supplier', budget: 'heavy' },
  { label: 'fulfillment-board', path: '/api/fulfillment/board', role: 'supplier', budget: 'heavy' },
  { label: 'notifications-unread', path: '/api/notifications/unread-count', role: 'restaurant', budget: 'standard' },
  { label: 'entitlements', path: '/api/subscriptions/entitlements', role: 'restaurant', budget: 'standard' },
  { label: 'admin-overview', path: '/api/admin-dashboard/overview', role: 'admin', budget: 'heavy' },
  { label: 'supplier-command-center', path: '/api/supplier/command-center', role: 'supplier', budget: 'heavy' },
  { label: 'reports-spend', path: '/api/reports/restaurant/spend-by-supplier', role: 'restaurant', budget: 'heavy' },
  { label: 'reorder-suggestions', path: '/api/restaurant-inventory/reorder-suggestions', role: 'restaurant', budget: 'standard' },
]

async function fetchHealthDetail() {
  try {
    const res = await fetch(`${BASE_URL}/health`)
    return await res.json()
  } catch (err) {
    return { error: err.message }
  }
}

function writeReports(payload) {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true })
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2))

  let md = `# API Performance Audit Results\n\n`
  md += `**Generated:** ${payload.generatedAt}\n`
  md += `**Base URL:** ${payload.baseUrl}\n`
  md += `**Samples per endpoint:** ${payload.samples} (after ${payload.warmup} warmup)\n\n`
  md += `## Infrastructure\n\n\`\`\`json\n${JSON.stringify(payload.health, null, 2)}\n\`\`\`\n\n`
  md += `## Results\n\n`
  md += `| Endpoint | Role | avg | p50 | p95 | max | Budget | Status | Over |\n`
  md += `|----------|------|-----|-----|-----|-----|--------|--------|------|\n`
  for (const r of payload.results) {
    md += `| \`${r.route}\` | ${r.role || '-'} | ${r.avg}ms | ${r.p50}ms | ${r.p95}ms | ${r.max}ms | ${r.budget}ms | ${r.outcome} | ${r.overBudget ? 'YES' : 'no'} |\n`
  }
  md += `\n## Over budget (p95)\n\n`
  const over = payload.results.filter((r) => r.overBudget)
  if (!over.length) md += `_None_\n`
  else for (const r of over) md += `- **${r.label}** p95=${r.p95}ms (budget ${r.budget}ms)\n`

  fs.writeFileSync(OUT_MD, md)
  console.log(`\nWrote ${OUT_JSON}`)
  console.log(`Wrote ${OUT_MD}`)
}

async function discoverContext() {
  const ctx = { orderId: null }
  try {
    const token = await getTokenForRole('restaurant')
    if (!token) return ctx
    const res = await fetch(`${BASE_URL}/api/orders?limit=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) return ctx
    const body = await res.json()
    const orders = body?.data?.orders ?? body?.orders ?? []
    if (orders[0]?.id) ctx.orderId = orders[0].id
  } catch {
    /* best effort */
  }
  return ctx
}

async function resolveEndpoints(ctx) {
  const list = [...ENDPOINTS]
  if (ctx.orderId) {
    list.splice(
      list.findIndex((e) => e.label === 'orders-list-with-items') + 1,
      0,
      {
        label: 'order-detail',
        path: `/api/orders/${ctx.orderId}`,
        role: 'restaurant',
        budget: 'standard',
      }
    )
  }
  return list
}

async function main() {
  console.log(`Supplify API Performance Audit`)
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Samples: ${SAMPLES} (+${WARMUP} warmup)\n`)

  const health = await fetchHealthDetail()
  console.log('Health:', JSON.stringify(health))

  const ctx = await discoverContext()
  if (ctx.orderId) console.log(`Discovered orderId: ${ctx.orderId}`)
  const endpoints = await resolveEndpoints(ctx)

  const results = []
  for (const ep of endpoints) {
    process.stdout.write(`Benchmarking ${ep.label}... `)
    const r = await benchmarkEndpoint(ep)
    results.push(r)
    console.log(
      `avg=${r.avg}ms p50=${r.p50}ms p95=${r.p95}ms max=${r.max}ms ${r.outcome}${r.overBudget ? ' OVER' : ''}`
    )
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    samples: SAMPLES,
    warmup: WARMUP,
    health,
    results,
  }
  writeReports(payload)

  const overCount = results.filter((r) => r.overBudget).length
  const failCount = results.filter((r) => r.outcome !== 'OK').length
  console.log(`\nDone: ${results.length} endpoints, ${overCount} over budget, ${failCount} failed`)
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
