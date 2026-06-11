#!/usr/bin/env node
/**
 * Safe dev API smoke tests — read-only by default.
 * Usage:
 *   node scripts/dev-api-smoke-test.mjs
 *   node scripts/dev-api-smoke-test.mjs --phase=public|admin|supplier|restaurant|staff-rbac|mutations|all
 *
 * Env:
 *   SUPPLIFY_DEV_API_URL / API_URL — target API base
 *   SUPPLIFY_ALLOW_MUTATIONS=true — enable Phase 6 mutation probes (smoke_test_ prefix)
 *   SUPPLIFY_*_TOKEN — Bearer token overrides (admin, supplier, restaurant, staff)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getTokenForRole, verifyTokenOverrides, resolveTokensFromEnv, getTokenSource } from './lib/auth-token.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '../../..')
const PARTIALS_DIR = path.join(REPO_ROOT, 'docs/audits/partials')
const OUT_JSON = path.join(REPO_ROOT, 'docs/audits/dev-api-route-test-results.json')
const OUT_MD = path.join(REPO_ROOT, 'docs/audits/DEV_API_ROUTE_TEST_RESULTS.md')

const BASE_URL = (process.env.SUPPLIFY_DEV_API_URL || process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '')
const ALLOW_MUTATIONS = process.env.SUPPLIFY_ALLOW_MUTATIONS === 'true'
const TEST_MODE = process.env.SUPPLIFY_TEST_MODE || 'safe'

const SLOW_THRESHOLDS = { public: 500, normal: 1500, heavy: 3000 }

/** Standardized skip reason prefixes (Phase 7). */
const SKIP = {
  UNSAFE: 'SKIPPED_UNSAFE',
  NEEDS_SEED_DATA: 'NEEDS_SEED_DATA',
  MUTATION: 'SKIP_MUTATION',
  NO_CONTEXT: 'SKIP_NO_CONTEXT',
}

const args = process.argv.slice(2)
const phaseArg = args.find((a) => a.startsWith('--phase='))
const PHASE = phaseArg ? phaseArg.split('=')[1] : 'all'

const results = []
const context = { ids: {}, slugs: {}, auth: {} }
let phaseStartIndex = 0

function parsePhaseList() {
  if (PHASE === 'all') {
    const phases = ['public', 'admin', 'supplier', 'restaurant', 'staff-rbac']
    if (ALLOW_MUTATIONS) phases.push('mutations')
    return phases
  }
  return [PHASE]
}

async function request(method, routePath, { role = null, expect = [200], body = null, label = routePath } = {}) {
  const url = `${BASE_URL}${routePath}`
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'

  if (role) {
    let token
    try {
      token = await getTokenForRole(role)
    } catch (err) {
      return record({
        route: routePath,
        method,
        role,
        outcome: 'SKIP',
        skipReason: `${SKIP.NEEDS_SEED_DATA} — token unavailable for ${role}: ${err.message}`,
        label,
      })
    }
    if (!token) {
      return record({
        route: routePath,
        method,
        role,
        outcome: 'SKIP',
        skipReason: `${SKIP.NEEDS_SEED_DATA} — no token for ${role} (set SUPPLIFY_${role.toUpperCase()}_TOKEN or seed Keycloak)`,
        label,
      })
    }
    headers.Authorization = `Bearer ${token}`
  }

  const start = performance.now()
  let status = 0
  let responseBytes = 0
  let data = null
  let errorText = ''

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: method === 'GET' && routePath.startsWith('/auth/login') ? 'manual' : 'follow',
    })
    status = res.status
    const text = await res.text()
    responseBytes = text.length
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { _raw: text.slice(0, 500) }
    }
    errorText = data?.error?.message || data?.error || ''
  } catch (err) {
    return record({
      route: routePath,
      method,
      role,
      outcome: 'FAIL',
      status: 0,
      durationMs: Math.round(performance.now() - start),
      responseBytes: 0,
      error: err.message,
      label,
    })
  }

  const durationMs = Math.round(performance.now() - start)
  const ok = expect.includes(status)
  const slowThreshold =
    routePath.includes('report') || routePath.includes('admin-dashboard')
      ? SLOW_THRESHOLDS.heavy
      : routePath.startsWith('/health') || routePath.startsWith('/ready')
        ? SLOW_THRESHOLDS.public
        : SLOW_THRESHOLDS.normal
  const slow = durationMs > slowThreshold

  return record({
    route: routePath,
    method,
    role,
    status,
    durationMs,
    responseBytes,
    outcome: ok ? 'PASS' : 'FAIL',
    shapeOk: null,
    slow,
    error: ok ? null : errorText || `Expected ${expect.join('|')}, got ${status}`,
    label,
    data: ok ? data : undefined,
  })
}

function record(entry) {
  results.push({
    route: entry.route,
    method: entry.method || 'GET',
    role: entry.role || null,
    status: entry.status ?? null,
    durationMs: entry.durationMs ?? 0,
    responseBytes: entry.responseBytes ?? 0,
    outcome: entry.outcome,
    shapeOk: entry.shapeOk ?? null,
    skipReason: entry.skipReason || null,
    slow: entry.slow || false,
    error: entry.error || null,
    label: entry.label || entry.route,
  })
  const icon = entry.outcome === 'PASS' ? '✓' : entry.outcome === 'SKIP' ? '○' : '✗'
  console.log(
    `${icon} ${entry.method || 'GET'} ${entry.route} [${entry.role || 'none'}] → ${entry.outcome}${entry.status ? ` (${entry.status})` : ''}${entry.skipReason ? ` — ${entry.skipReason}` : ''}`
  )
  return entry
}

function skip(route, method, role, reason) {
  return record({ route, method, role, outcome: 'SKIP', skipReason: reason })
}

function checkShape(entry, validator) {
  if (!entry?.data || entry.outcome !== 'PASS') return
  const ok = validator(entry.data)
  const r = results[results.length - 1]
  r.shapeOk = ok
  if (!ok) {
    r.outcome = 'FAIL'
    r.error = (r.error || '') + ' shape validation failed'
    console.log(`  ✗ shape check failed for ${entry.route}`)
  }
}

async function adminFetch(routePath) {
  const token = await getTokenForRole('admin').catch(() => null)
  if (!token) return null
  const res = await fetch(`${BASE_URL}${routePath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) return null
  return res.json()
}

async function discoverTenantContext() {
  try {
    const suppliersJson = await adminFetch('/api/admin-dashboard/tenants/suppliers')
    const suppliers = suppliersJson?.data?.suppliers ?? suppliersJson?.data ?? []
    if (Array.isArray(suppliers) && suppliers.length) {
      context.ids.suppliers = suppliers.map((s) => s.id).filter(Boolean)
      if (suppliers[0]?.slug) {
        context.slugs.supplier = suppliers[0].slug
        context.ids.supplier = suppliers[0].id
      }
      if (suppliers.length > 1) context.ids.otherSupplier = suppliers[1].id
    }

    const restaurantsJson = await adminFetch('/api/admin-dashboard/tenants/restaurants')
    const restaurants = restaurantsJson?.data?.restaurants ?? restaurantsJson?.data ?? []
    if (Array.isArray(restaurants) && restaurants.length) {
      context.ids.restaurants = restaurants.map((r) => r.id).filter(Boolean)
      context.ids.restaurant = restaurants[0].id
      if (restaurants.length > 1) context.ids.otherRestaurant = restaurants[1].id
    }

    if (context.ids.otherSupplier) {
      const productsJson = await adminFetch(`/api/products?supplier=${context.ids.otherSupplier}&limit=1`)
      const products = productsJson?.data?.products ?? productsJson?.data ?? []
      if (Array.isArray(products) && products[0]?.id) {
        context.ids.otherSupplierProduct = products[0].id
      }
    }
  } catch {
    /* discovery is best-effort */
  }
}

async function logAuthVerification() {
  const envOverrides = resolveTokensFromEnv()
  const report = await verifyTokenOverrides()
  context.auth = { envOverrides: Object.keys(envOverrides), sources: {}, report }
  for (const role of ['admin', 'supplier', 'restaurant', 'staff']) {
    context.auth.sources[role] = getTokenSource(role)
    const line = report[role]
    const icon = line.ok ? '✓' : '○'
    console.log(`${icon} auth ${role}: ${line.source} — ${line.detail}`)
  }
  console.log('')
}

// ─── Phase 3: Public ───────────────────────────────────────────────
async function phasePublic() {
  console.log('\n=== Phase 3: Health & Public ===\n')
  let r = await request('GET', '/health', { expect: [200] })
  checkShape(r, (d) => d?.status === 'ok' || d?.ok === true)

  r = await request('GET', '/ready', { expect: [200, 503] })

  r = await request('GET', '/auth/login', { expect: [302, 307, 200] })
  r = await request('GET', '/auth/session', { expect: [200] })
  await request('GET', '/auth/me', { role: null, expect: [401] })

  await discoverTenantContext()

  if (context.slugs.supplier) {
    await request('GET', `/api/public/suppliers/${context.slugs.supplier}`, { expect: [200, 404] })
    await request('GET', `/api/public/suppliers/${context.slugs.supplier}/products`, { expect: [200, 404] })
  } else {
    await request('GET', '/api/public/suppliers/unknown-slug-test', { expect: [404, 500] })
    skip('/api/public/suppliers/:slug/products', 'GET', null, `${SKIP.NO_CONTEXT} — no supplier slug from admin tenants`)
  }

  await request('GET', '/api/public/invitations?token=00000000-0000-0000-0000-000000000000', { expect: [400, 404] })
  skip('POST /api/public/staff/request-link', 'POST', null, `${SKIP.UNSAFE} — sends email`)
}

// ─── Phase 4: Admin ────────────────────────────────────────────────
async function phaseAdmin() {
  console.log('\n=== Phase 4: Admin Dashboard ===\n')
  const routes = [
    '/api/admin-dashboard/overview',
    '/api/admin-dashboard/operational-summary',
    '/api/admin-dashboard/operational/active-deliveries',
    '/api/admin-dashboard/operational/fulfillment-issues',
    '/api/admin-dashboard/operational/email-logs',
    '/api/admin-dashboard/plans',
    '/api/admin-dashboard/tenants/suppliers',
    '/api/admin-dashboard/tenants/restaurants',
    '/api/admin-dashboard/tenants/search?q=demo',
    '/api/admin-dashboard/subscriptions',
    '/api/admin-dashboard/limit-keys',
    '/api/admin-dashboard/limit-overrides',
    '/api/admin-dashboard/feature-flags',
    '/api/admin-dashboard/audit-logs',
    '/api/admin-dashboard/health',
    '/api/admin-dashboard/financial-overview',
    '/api/admin-dashboard/platform-settings',
    '/api/admin-dashboard/conversion-stats',
    '/api/admin-dashboard/activity',
    '/api/admin-dashboard/users',
  ]

  for (const route of routes) {
    const r = await request('GET', route, { role: 'admin', expect: [200, 403] })
    if (route === '/api/admin-dashboard/overview' && r?.outcome === 'PASS') {
      checkShape(r, (d) => d?.data != null)
    }
    if (route === '/api/admin-dashboard/plans' && r?.outcome === 'PASS') {
      checkShape(r, (d) => Array.isArray(d?.data?.plans ?? d?.data))
      const plans = r.data?.data?.plans ?? r.data?.data
      if (Array.isArray(plans) && plans[0]?.id) {
        context.ids.plan = plans[0].id
        await request('GET', `/api/admin-dashboard/plans/${plans[0].id}`, { role: 'admin', expect: [200, 404] })
      }
    }
    if (route === '/api/admin-dashboard/tenants/suppliers' && r?.outcome === 'PASS') {
      await discoverTenantContext()
    }
  }

  skip('POST /api/admin-dashboard/impersonate', 'POST', 'admin', `${SKIP.UNSAFE} — impersonation`)
  skip('POST /api/admin-dashboard/users/reset-password', 'POST', 'admin', `${SKIP.UNSAFE} — password reset email`)
}

// ─── Phase 5: Supplier ─────────────────────────────────────────────
async function phaseSupplier() {
  console.log('\n=== Phase 5: Supplier ===\n')
  const reads = [
    '/api/products',
    '/api/products/categories',
    '/api/products/tags',
    '/api/inventory',
    '/api/inventory/alerts',
    '/api/warehouses',
    '/api/fulfillment/board',
    '/api/fulfillment/routes',
    '/api/fulfillment/routes/today',
    '/api/fulfillment/routes/active',
    '/api/fulfillment/dispatch',
    '/api/fulfillment/exceptions',
    '/api/orders',
    '/api/orders/calendar/',
    '/api/invoices',
    '/api/promotions',
    '/api/supplier/command-center',
    '/api/supplier/deliveries/board',
    '/api/supplier/invoices/receivables',
    '/api/supplier/reorder-assistance',
    '/api/supplier/reorder-intelligence',
    '/api/supplier/reorder-cadence/at-risk',
    '/api/suppliers/me',
    '/api/chat/conversations',
    '/api/chat/quick-replies',
    '/api/notifications',
    '/api/notifications/unread-count',
    '/api/notifications/preferences',
    '/api/quote-requests/supplier/inbox',
    '/api/drivers',
    '/api/drivers/unlinked',
    '/api/disputes/incoming',
    '/api/credit-notes/',
    '/api/audit/logs',
    '/api/org/',
    '/api/subscriptions/entitlements',
    '/api/subscriptions/current',
    '/api/billing/status',
  ]

  for (const route of reads) {
    const r = await request('GET', route, { role: 'supplier', expect: [200, 402, 403, 404] })
    if (route === '/api/inventory' && r?.outcome === 'PASS') {
      checkShape(r, (d) => Array.isArray(d?.data?.inventory ?? d?.data?.items ?? d?.data) || d?.data != null)
    }
    if (route === '/api/products' && r?.outcome === 'PASS') {
      const products = r.data?.data?.products ?? r.data?.products ?? r.data?.data
      if (Array.isArray(products) && products[0]?.id) {
        context.ids.product = products[0].id
        context.ids.ownSupplierProduct = products[0].id
        await request('GET', `/api/products/${products[0].id}`, { role: 'supplier', expect: [200] })
      }
    }
    if (route === '/api/orders' && r?.outcome === 'PASS') {
      const orders = r.data?.data?.orders ?? r.data?.orders ?? r.data?.data
      if (Array.isArray(orders) && orders.length) {
        const first = orders[0]
        if (first?.id) {
          context.ids.order = first.id
          context.ids.orderRestaurantId = first.restaurant_id ?? null
          await request('GET', `/api/orders/${first.id}`, { role: 'supplier', expect: [200, 404] })
        }
        const crossTenant = orders.find(
          (o) => o?.id && o.restaurant_id && o.restaurant_id !== first?.restaurant_id
        )
        if (crossTenant?.id) {
          context.ids.crossTenantOrder = crossTenant.id
          context.ids.crossTenantOrderRestaurantId = crossTenant.restaurant_id
        }
      }
    }
    if (route === '/api/suppliers/me' && r?.outcome === 'PASS') {
      const me = r.data?.data ?? r.data
      if (me?.id) context.ids.ownSupplier = me.id
    }
  }

  console.log('\n--- Supplier RBAC negatives ---\n')
  await request('GET', '/api/admin-dashboard/overview', { role: 'supplier', expect: [403, 401], label: 'supplier→admin overview' })
  await request('GET', '/api/restaurant-finance/invoices', { role: 'supplier', expect: [403, 401, 404], label: 'supplier→restaurant finance' })
  await request('GET', '/api/restaurants/me', { role: 'supplier', expect: [403, 401, 404], label: 'supplier→restaurant me' })
  await request('GET', '/api/staff/members', { role: 'supplier', expect: [403, 401], label: 'supplier→staff members' })

  if (context.ids.otherSupplier && context.ids.ownSupplier && context.ids.otherSupplier !== context.ids.ownSupplier) {
    await request('GET', `/api/suppliers/${context.ids.otherSupplier}`, {
      role: 'supplier',
      expect: [403, 404],
      label: 'cross-tenant: supplier→other supplier profile',
    })
  } else if (context.ids.otherSupplierProduct) {
    await request('GET', `/api/products/${context.ids.otherSupplierProduct}`, {
      role: 'supplier',
      expect: [403, 404],
      label: 'cross-tenant: supplier→other supplier product',
    })
  } else {
    skip('cross-tenant supplier', 'GET', 'supplier', `${SKIP.NO_CONTEXT} — need 2 supplier tenant ids from admin`)
  }
}

// ─── Phase 6: Restaurant ───────────────────────────────────────────
async function phaseRestaurant() {
  console.log('\n=== Phase 6: Restaurant ===\n')
  const reads = [
    '/api/restaurants/me',
    '/api/restaurants/me/delivery-locations',
    '/api/suppliers/followed',
    '/api/orders',
    '/api/quick-lists',
    '/api/restaurant-inventory',
    '/api/restaurant-inventory/expiry',
    '/api/restaurant-inventory/expiry/summary',
    '/api/restaurant-inventory/expiry/settings',
    '/api/restaurant-inventory/reorder-suggestions',
    '/api/receiving/pending-orders',
    '/api/restaurant-finance/invoices',
    '/api/restaurant-org',
    '/api/restaurant-org/branches',
    '/api/restaurant-org/users',
    '/api/restaurant-pricing/my-pricing',
    '/api/promotions/active',
    '/api/promotions/new-deals-banner',
    '/api/quote-requests',
    '/api/chat/conversations',
    '/api/notifications',
    '/api/notifications/unread-count',
    '/api/subscriptions/entitlements',
    '/api/subscriptions/current',
    '/api/billing/status',
    '/api/branches/',
    '/api/reports/restaurant/spend-by-supplier',
    '/api/audit/logs',
  ]

  for (const route of reads) {
    const r = await request('GET', route, { role: 'restaurant', expect: [200, 402, 403, 404] })
    if (route === '/api/quick-lists' && r?.outcome === 'PASS') {
      const lists = r.data?.data?.quickLists ?? r.data?.data ?? r.data?.quickLists
      if (Array.isArray(lists) && lists[0]?.id) {
        context.ids.quickList = lists[0].id
        await request('GET', `/api/quick-lists/${lists[0].id}`, { role: 'restaurant', expect: [200, 404] })
      }
    }
    if (route === '/api/restaurants/me' && r?.outcome === 'PASS') {
      const me = r.data?.data ?? r.data
      const restaurantId = me?.restaurant?.id ?? me?.id
      if (restaurantId) context.ids.ownRestaurant = restaurantId
    }
  }

  if (!ALLOW_MUTATIONS) {
    skip('POST /api/orders', 'POST', 'restaurant', `${SKIP.MUTATION} — set SUPPLIFY_ALLOW_MUTATIONS=true to probe`)
  }

  console.log('\n--- Restaurant RBAC negatives ---\n')
  await request('GET', '/api/fulfillment/board', { role: 'restaurant', expect: [403, 401], label: 'restaurant→fulfillment board' })
  await request('GET', '/api/admin-dashboard/overview', { role: 'restaurant', expect: [403, 401], label: 'restaurant→admin overview' })
  await request('GET', '/api/inventory', { role: 'restaurant', expect: [403, 401, 404], label: 'restaurant→supplier inventory' })
  await request('GET', '/api/supplier/command-center', { role: 'restaurant', expect: [403, 401, 404], label: 'restaurant→supplier command-center' })

  const crossOrderId = context.ids.crossTenantOrder ?? context.ids.order
  const crossOrderRestaurantId =
    context.ids.crossTenantOrderRestaurantId ?? context.ids.orderRestaurantId
  const ownRestaurant = context.ids.ownRestaurant

  if (crossOrderId && ownRestaurant && crossOrderRestaurantId && crossOrderRestaurantId !== ownRestaurant) {
    await request('GET', `/api/orders/${crossOrderId}`, {
      role: 'restaurant',
      expect: [403, 404],
      label: 'cross-tenant: restaurant→other restaurant order',
    })
  } else if (context.ids.order && ownRestaurant && context.ids.orderRestaurantId === ownRestaurant) {
    await request('GET', `/api/orders/${context.ids.order}`, {
      role: 'restaurant',
      expect: [200],
      label: 'same-tenant: restaurant→own order from supplier list sample',
    })
  } else {
    skip(
      'cross-tenant restaurant order',
      'GET',
      'restaurant',
      `${SKIP.NO_CONTEXT} — no mismatched order/restaurant id for cross-tenant probe`
    )
  }
}

// ─── Phase 6b: Mutations (optional) ───────────────────────────────
async function phaseMutations() {
  console.log('\n=== Phase 6b: Mutations (smoke_test_ prefix) ===\n')

  if (!ALLOW_MUTATIONS) {
    skip('mutations phase', '—', null, `${SKIP.MUTATION} — SUPPLIFY_ALLOW_MUTATIONS not true`)
    return
  }

  const stamp = Date.now()
  const qlName = `smoke_test_ql_${stamp}`

  const qlRes = await request(
    'POST',
    '/api/quick-lists',
    {
      role: 'restaurant',
      expect: [201, 200, 402, 403],
      body: { name: qlName, description: 'dev-api smoke test', items: [] },
      label: 'POST quick-list smoke_test_',
    }
  )
  const qlId = qlRes?.data?.data?.id ?? qlRes?.data?.id
  if (qlId) {
    await request('DELETE', `/api/quick-lists/${qlId}`, { role: 'restaurant', expect: [200, 204, 404], label: 'cleanup quick-list' })
  }

  const sku = `smoke_test_${stamp}`
  const prodRes = await request(
    'POST',
    '/api/products',
    {
      role: 'supplier',
      expect: [201, 200, 402, 403],
      body: { sku, name: `smoke_test_product_${stamp}`, unit: 'ea' },
      label: 'POST product smoke_test_',
    }
  )
  const prodId = prodRes?.data?.data?.id ?? prodRes?.data?.id
  if (prodId) {
    await request('PATCH', `/api/products/${prodId}`, {
      role: 'supplier',
      expect: [200, 404],
      body: { description: 'smoke test cleanup marker' },
      label: 'PATCH product smoke_test_',
    })
  }

  skip('POST /api/orders', 'POST', 'restaurant', `${SKIP.UNSAFE} — order create still skipped (commercial side-effect)`)
  skip('POST /api/staff/send-invite', 'POST', 'restaurant', `${SKIP.UNSAFE} — staff invite sends email`)
}

// ─── Phase 7-8: Staff + RBAC ───────────────────────────────────────
async function phaseStaffRbac() {
  console.log('\n=== Phase 7-8: Staff Portal & RBAC ===\n')

  const staffToken = await getTokenForRole('staff').catch(() => null)
  if (staffToken) {
    const selfRoutes = [
      '/api/staff/self/dashboard',
      '/api/staff/self/time-entries',
      '/api/staff/self/availability',
    ]
    for (const route of selfRoutes) {
      await request('GET', route, { role: 'staff', expect: [200, 403] })
    }

    console.log('\n--- Staff portal RBAC negatives (expect 403) ---\n')
    await request('GET', '/api/staff/members', { role: 'staff', expect: [403], label: 'staff→staff/members' })
    await request('GET', '/api/orders', { role: 'staff', expect: [403, 401], label: 'staff→orders' })
    await request('GET', '/api/inventory', { role: 'staff', expect: [403, 401], label: 'staff→inventory' })
    await request('GET', '/api/admin-dashboard/overview', { role: 'staff', expect: [403, 401], label: 'staff→admin' })
    await request('GET', '/api/restaurant-finance/invoices', { role: 'staff', expect: [403, 401], label: 'staff→restaurant finance' })
    await request('GET', '/api/quick-lists', { role: 'staff', expect: [403, 401], label: 'staff→quick-lists' })
  } else {
    const staffSkipReason = getTokenSource('staff') === 'unavailable'
      ? `${SKIP.NEEDS_SEED_DATA} — no SUPPLIFY_STAFF_TOKEN and no E2E_STAFF_EMAIL/PASSWORD`
      : `${SKIP.NEEDS_SEED_DATA} — staff Keycloak grant failed; use SUPPLIFY_STAFF_TOKEN`
    for (const route of ['/api/staff/self/dashboard', '/api/staff/self/time-entries', '/api/staff/self/availability']) {
      skip(route, 'GET', 'staff', staffSkipReason)
    }
    skip('staff→/api/staff/members 403', 'GET', 'staff', staffSkipReason)
  }

  const protectedRoutes = [
    '/api/orders',
    '/api/inventory',
    '/api/admin-dashboard/overview',
    '/api/warehouses',
    '/api/fulfillment/board',
    '/api/restaurant-finance/invoices',
    '/api/staff/members',
    '/api/quick-lists',
    '/api/restaurant-inventory/expiry',
    '/api/supplier/command-center',
  ]

  console.log('\n--- Unauthenticated 401 matrix ---\n')
  for (const route of protectedRoutes) {
    await request('GET', route, { role: null, expect: [401] })
  }
}

function writePartial(phaseName) {
  fs.mkdirSync(PARTIALS_DIR, { recursive: true })
  const slice = results.slice(phaseStartIndex)
  const out = path.join(PARTIALS_DIR, `phase-${phaseName}.json`)
  fs.writeFileSync(
    out,
    JSON.stringify({ phase: phaseName, baseUrl: BASE_URL, generatedAt: new Date().toISOString(), results: slice }, null, 2)
  )
  console.log(`\nWrote partial: ${out}`)
  phaseStartIndex = results.length
}

function summarize() {
  const passed = results.filter((r) => r.outcome === 'PASS').length
  const failed = results.filter((r) => r.outcome === 'FAIL').length
  const skipped = results.filter((r) => r.outcome === 'SKIP').length
  const slow = results.filter((r) => r.slow).length
  const errors500 = results.filter((r) => r.status >= 500)
  const skipReasons = {}
  for (const r of results.filter((x) => x.outcome === 'SKIP')) {
    const prefix = (r.skipReason || 'unknown').split(' — ')[0].split(' ')[0]
    skipReasons[prefix] = (skipReasons[prefix] || 0) + 1
  }

  return { passed, failed, skipped, slow, errors500, total: results.length, skipReasons }
}

function loadPreviousRuns() {
  try {
    if (!fs.existsSync(OUT_JSON)) return []
    const prev = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'))
    if (Array.isArray(prev.runs)) return prev.runs
    if (prev.results) {
      return [
        {
          label: 'baseline-2026-06-11',
          generatedAt: prev.generatedAt || '2026-06-11T15:21:32.949Z',
          environment: prev.environment,
          summary: prev.summary,
          results: prev.results,
        },
      ]
    }
    return []
  } catch {
    return []
  }
}

function writeFinalReports() {
  const summary = summarize()
  const slowest = [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 15)

  const runPayload = {
    label: `expanded-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    environment: {
      baseUrl: BASE_URL,
      testMode: TEST_MODE,
      allowMutations: ALLOW_MUTATIONS,
      auth: context.auth,
    },
    summary,
    slowest,
    results,
  }

  const previousRuns = loadPreviousRuns()
  const baselineFromPartial = path.join(PARTIALS_DIR, 'all-phases.json')
  if (!previousRuns.length && fs.existsSync(baselineFromPartial)) {
    try {
      const partial = JSON.parse(fs.readFileSync(baselineFromPartial, 'utf8'))
      if (partial.results?.length) {
        previousRuns.push({
          label: 'baseline-all-phases-2026-06-11',
          generatedAt: '2026-06-11T15:21:32.949Z',
          environment: { baseUrl: partial.baseUrl, testMode: 'safe', allowMutations: false },
          summary: {
            passed: partial.results.filter((r) => r.outcome === 'PASS').length,
            failed: partial.results.filter((r) => r.outcome === 'FAIL').length,
            skipped: partial.results.filter((r) => r.outcome === 'SKIP').length,
            total: partial.results.length,
          },
          results: partial.results,
        })
      }
    } catch {
      /* ignore */
    }
  }

  const runs = [...previousRuns.filter((r) => r.label !== runPayload.label), runPayload]

  const payload = {
    generatedAt: runPayload.generatedAt,
    latest: runPayload,
    runs,
    environment: runPayload.environment,
    summary,
    slowest,
    results,
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true })
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2))

  let md = `# Dev API Route Test Results\n\n`
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`
  md += `**Base URL:** ${BASE_URL}\n`
  md += `**Test mode:** ${TEST_MODE} | **Mutations:** ${ALLOW_MUTATIONS}\n\n`
  md += `## Latest run summary\n\n`
  md += `| Metric | Count |\n|--------|-------|\n`
  md += `| Total tested | ${summary.total} |\n`
  md += `| Passed | ${summary.passed} |\n`
  md += `| Failed | ${summary.failed} |\n`
  md += `| Skipped | ${summary.skipped} |\n`
  md += `| Slow (over threshold) | ${summary.slow} |\n`
  md += `| 500 errors | ${summary.errors500.length} |\n\n`

  if (Object.keys(summary.skipReasons || {}).length) {
    md += `### Skip reasons\n\n`
    for (const [reason, count] of Object.entries(summary.skipReasons)) {
      md += `- **${reason}**: ${count}\n`
    }
    md += `\n`
  }

  if (context.auth?.report) {
    md += `### Auth token sources\n\n`
    for (const [role, info] of Object.entries(context.auth.report)) {
      md += `- **${role}**: ${info.source} — ${info.ok ? 'OK' : 'FAIL'} (${info.detail})\n`
    }
    md += `\n`
  }

  md += `## Run history\n\n`
  for (const run of runs) {
    md += `- **${run.label}** (${run.generatedAt?.slice(0, 19) || '?'}) — pass ${run.summary?.passed ?? '?'} / fail ${run.summary?.failed ?? '?'} / skip ${run.summary?.skipped ?? '?'} / total ${run.summary?.total ?? '?'}\n`
  }
  md += `\n`

  if (summary.errors500.length) {
    md += `## 500 Errors (latest)\n\n`
    for (const e of summary.errors500) {
      md += `- \`${e.method} ${e.route}\` — ${e.error || 'unknown'}\n`
    }
    md += `\n`
  }

  if (summary.failed) {
    md += `## Failures (latest)\n\n`
    for (const e of results.filter((r) => r.outcome === 'FAIL')) {
      md += `- \`${e.method} ${e.route}\` [${e.role || 'none'}] status=${e.status} — ${e.error || ''}\n`
    }
    md += `\n`
  }

  md += `## Slowest routes (latest)\n\n`
  for (const s of slowest) {
    md += `- \`${s.method} ${s.route}\` — ${s.durationMs}ms\n`
  }

  md += `\n## Manual QA checklist\n\n`
  md += `- [ ] Admin token can access admin overview\n`
  md += `- [ ] Supplier token can access products/inventory/orders/command-center\n`
  md += `- [ ] Restaurant token can access dashboard/expiry/quick-lists/invoices\n`
  md += `- [ ] Staff token can access only staff self routes (if token available)\n`
  md += `- [ ] Staff → /api/staff/members returns 403\n`
  md += `- [ ] Supplier/restaurant → admin returns 403\n`
  md += `- [ ] Unauthenticated gets 401 on protected routes\n`
  md += `- [ ] Cross-tenant 403/404 verified\n`
  md += `- [ ] No unexpected 500s\n`

  fs.writeFileSync(OUT_MD, md)
  console.log(`\nWrote ${OUT_JSON}`)
  console.log(`Wrote ${OUT_MD}`)
  return summary
}

async function main() {
  console.log(`Supplify Dev API Smoke Test`)
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Phase: ${PHASE} | Mode: ${TEST_MODE} | Mutations: ${ALLOW_MUTATIONS}\n`)

  await logAuthVerification()

  const phases = parsePhaseList()
  for (const p of phases) {
    if (p === 'public') await phasePublic()
    else if (p === 'admin') await phaseAdmin()
    else if (p === 'supplier') await phaseSupplier()
    else if (p === 'restaurant') await phaseRestaurant()
    else if (p === 'staff-rbac') await phaseStaffRbac()
    else if (p === 'mutations') await phaseMutations()
    if (PHASE !== 'all') writePartial(p)
  }

  if (PHASE === 'all') {
    fs.mkdirSync(PARTIALS_DIR, { recursive: true })
    fs.writeFileSync(
      path.join(PARTIALS_DIR, 'all-phases.json'),
      JSON.stringify({ baseUrl: BASE_URL, generatedAt: new Date().toISOString(), results }, null, 2)
    )
  }

  const summary = writeFinalReports()
  console.log(`\n${'='.repeat(50)}`)
  console.log(`PASS: ${summary.passed} | FAIL: ${summary.failed} | SKIP: ${summary.skipped}`)
  process.exit(summary.failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
