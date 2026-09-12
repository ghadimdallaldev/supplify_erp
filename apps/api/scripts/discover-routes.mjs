#!/usr/bin/env node
/**
 * Discover all Express API routes and emit inventory + markdown matrix.
 * Usage: node scripts/discover-routes.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const ROUTES_DIR = path.join(ROOT, 'src/routes')
const SERVER_JS = path.join(ROOT, 'src/server.js')
const OUT_JSON = path.join(ROOT, '../../docs/audits/route-inventory.json')
const OUT_MD = path.join(ROOT, '../../docs/audits/DEV_API_ROUTE_TEST_MATRIX.md')

const UNSAFE_PATTERNS = [
  /\/billing\/(checkout|pay-now)/,
  /\/payments/,
  /\/e2e\//,
  /request-link/,
  /\/pay-activation/,
  /\/featured-placement\/purchase/,
  /\/invoices\/.*\/pay/,
  /reset-seed/,
  /reset-password/,
  /\/impersonate/,
  /\/push/,
  /send-invite/,
  /send-notification/,
  /notifications\/test/,
]

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Map relative route file path → HTTP mount prefix */
const FILE_PREFIX_OVERRIDES = {
  'auth.routes.js': '/auth',
  'register.routes.js': '/api/register',
  'products.routes.js': '/api/products',
  'prices.routes.js': '/api/prices',
  'inventory.routes.js': '/api/inventory',
  'restaurants.routes.js': '/api/restaurants',
  'orders.calendar.routes.js': '/api/orders/calendar',
  'disputes.routes.js': '/api/disputes',
  'credit-notes.routes.js': '/api/credit-notes',
  'push.routes.js': '/api/push',
  'reviews.routes.js': '/api/reviews',
  'reports.routes.js': '/api/reports',
  'tenant-roles.routes.js': '/api/roles',
  'files.routes.js': '/api/files',
  'admin.routes.js': '/api/admin',
  'invoices.routes.js': '/api/invoices',
  'payments.routes.js': '/api/payments',
  'quick-lists.routes.js': '/api/quick-lists',
  'quote-requests.routes.js': '/api/quote-requests',
  'restaurant-inventory.routes.js': '/api/restaurant-inventory',
  'restaurant-onboarding.routes.js': '/api/restaurant-onboarding',
  'receiving.routes.js': '/api/receiving',
  'restaurant-finance.routes.js': '/api/restaurant-finance',
  'reservations.routes.js': '/api/reservations',
  'restaurant-pricing.routes.js': '/api/restaurant-pricing',
  'notifications.routes.js': '/api/notifications',
  'subscriptions.routes.js': '/api/subscriptions',
  'billing.routes.js': '/api/billing',
  'public.routes.js': '/api/public',
  'e2e.routes.js': '/api/e2e',
  'branches.routes.js': '/api/branches',
  'org.routes.js': '/api/org',
  'branch-invitations.routes.js': '/api/org/invitations',
  'restaurant-org.routes.js': '/api/restaurant-org',
  'restaurant-invitations.routes.js': '/api/restaurants/invitations',
  'branch-invitations-public.routes.js': '/api/public/invitations',
  'warehouses.routes.js': '/api/warehouses',
  'drivers.routes.js': '/api/drivers',
  'supplier-ops.routes.js': '/api/supplier',
  'tenant-audit.routes.js': '/api/audit',
  'orders-driver.routes.js': '/api/orders',
  'order-amendments.routes.js': '/api/orders/:orderId/amendments',
  'orders/list.js': '/api/orders',
  'orders/detail.js': '/api/orders',
  'orders/create.js': '/api/orders',
  'orders/update.js': '/api/orders',
  'orders/documents.js': '/api/orders',
  'orders/warehouses.js': '/api/orders',
  'suppliers/catalog.js': '/api/suppliers',
  'suppliers/profile.js': '/api/suppliers',
  'suppliers/admin.js': '/api/suppliers',
  'suppliers/branding.js': '/api/suppliers',
  'suppliers/manage.js': '/api/suppliers',
  'suppliers/relationships.js': '/api/suppliers',
  'staff/portal.js': '/api/staff',
  'staff/team.js': '/api/staff',
  'staff/schedule.js': '/api/staff',
  'staff/pto.js': '/api/staff',
  'staff/announcements.js': '/api/staff',
  'staff/documents.js': '/api/staff',
  'staff/reports.js': '/api/staff',
  'fulfillment/board.js': '/api/fulfillment',
  'fulfillment/exceptions.js': '/api/fulfillment',
  'fulfillment/routes.js': '/api/fulfillment',
  'promotions/restaurant.js': '/api/promotions',
  'promotions/supplier.js': '/api/promotions',
  'chat/support.js': '/api/chat',
  'chat/admin.js': '/api/chat',
  'chat/conversations.js': '/api/chat',
  'admin-dashboard/overview.js': '/api/admin-dashboard',
  'admin-dashboard/plans.js': '/api/admin-dashboard',
  'admin-dashboard/subscriptions.js': '/api/admin-dashboard',
  'admin-dashboard/audit.js': '/api/admin-dashboard',
  'admin-dashboard/tenants.js': '/api/admin-dashboard',
  'admin-dashboard/limits.js': '/api/admin-dashboard',
  'admin-dashboard/health.js': '/api/admin-dashboard',
  'admin-dashboard/finance.js': '/api/admin-dashboard',
  'admin-dashboard/features.js': '/api/admin-dashboard',
}

function classifyRoute(method, fullPath) {
  if (UNSAFE_PATTERNS.some((p) => p.test(fullPath))) {
    return { classification: 'UNSAFE', testStrategy: 'SKIP_UNSAFE' }
  }
  if (MUTATION_METHODS.has(method)) {
    return { classification: 'CONDITIONAL', testStrategy: 'SKIP_MUTATION' }
  }
  if (fullPath.startsWith('/health') || fullPath.startsWith('/ready')) {
    return { classification: 'SAFE', testStrategy: 'LIVE_GET' }
  }
  if (fullPath.startsWith('/api/public') || fullPath.startsWith('/auth')) {
    return { classification: 'SAFE', testStrategy: 'LIVE_GET' }
  }
  return { classification: 'SAFE', testStrategy: 'LIVE_GET' }
}

function inferAuth(fullPath) {
  if (
    fullPath.startsWith('/health') ||
    fullPath.startsWith('/ready') ||
    fullPath.startsWith('/auth/login') ||
    fullPath.startsWith('/auth/register') ||
    fullPath.startsWith('/auth/callback') ||
    fullPath.startsWith('/auth/refresh') ||
    fullPath.startsWith('/auth/mobile/refresh') ||
    fullPath.startsWith('/api/public')
  ) {
    return false
  }
  if (fullPath === '/auth/session') return 'optional'
  return true
}

function walkDir(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkDir(full, files)
    else if (entry.name.endsWith('.js') && !entry.name.includes('.test.')) files.push(full)
  }
  return files
}

function relRoutePath(abs) {
  return path.relative(ROUTES_DIR, abs).replace(/\\/g, '/')
}

function resolvePrefix(rel) {
  if (FILE_PREFIX_OVERRIDES[rel]) return FILE_PREFIX_OVERRIDES[rel]
  const base = path.basename(rel)
  if (FILE_PREFIX_OVERRIDES[base]) return FILE_PREFIX_OVERRIDES[base]
  return '/api/unknown'
}

function extractRoutesFromFile(absPath) {
  const content = fs.readFileSync(absPath, 'utf8')
  const rel = relRoutePath(absPath)
  const prefix = resolvePrefix(rel)
  const routes = []
  const re = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi
  let m
  while ((m = re.exec(content)) !== null) {
    const method = m[1].toUpperCase()
    let sub = m[2]
    if (!sub.startsWith('/')) sub = `/${sub}`
    const fullPath = `${prefix}${sub}`.replace(/\/+/g, '/')
    const { classification, testStrategy } = classifyRoute(method, fullPath)
    routes.push({
      method,
      path: fullPath,
      file: `apps/api/src/routes/${rel}`,
      authRequired: inferAuth(fullPath),
      roles: [],
      permissions: [],
      tenantType: fullPath.includes('admin-dashboard') ? 'ADMIN' : null,
      classification,
      testStrategy,
      expectedStatus: method === 'POST' ? 201 : 200,
    })
  }
  return routes
}

function addServerRoutes() {
  return [
    {
      method: 'GET',
      path: '/health',
      file: 'apps/api/src/server.js',
      authRequired: false,
      roles: [],
      permissions: [],
      tenantType: null,
      classification: 'SAFE',
      testStrategy: 'LIVE_GET',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/ready',
      file: 'apps/api/src/server.js',
      authRequired: false,
      roles: [],
      permissions: [],
      tenantType: null,
      classification: 'SAFE',
      testStrategy: 'LIVE_GET',
      expectedStatus: 200,
    },
  ]
}

function generateMarkdown(routes) {
  const byPrefix = new Map()
  for (const r of routes) {
    const top = r.path.split('/').slice(0, 3).join('/') || r.path
    if (!byPrefix.has(top)) byPrefix.set(top, [])
    byPrefix.get(top).push(r)
  }

  let md = `# Dev API Route Test Matrix\n\n`
  md += `Generated: ${new Date().toISOString()}\n\n`
  md += `Total routes discovered: **${routes.length}**\n\n`
  md += `| Method | Path | File | Auth | Classification | Test strategy | Expected |\n`
  md += `|--------|------|------|------|----------------|---------------|----------|\n`

  const sorted = [...routes].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  for (const r of sorted) {
    const auth = r.authRequired === true ? 'yes' : r.authRequired === 'optional' ? 'optional' : 'no'
    md += `| ${r.method} | \`${r.path}\` | ${path.basename(r.file)} | ${auth} | ${r.classification} | ${r.testStrategy} | ${r.expectedStatus} |\n`
  }

  md += `\n## Summary by classification\n\n`
  const counts = {}
  for (const r of routes) {
    counts[r.classification] = (counts[r.classification] || 0) + 1
  }
  for (const [k, v] of Object.entries(counts).sort()) {
    md += `- **${k}**: ${v}\n`
  }

  md += `\n## Summary by test strategy\n\n`
  const strat = {}
  for (const r of routes) {
    strat[r.testStrategy] = (strat[r.testStrategy] || 0) + 1
  }
  for (const [k, v] of Object.entries(strat).sort()) {
    md += `- **${k}**: ${v}\n`
  }

  return md
}

function main() {
  const files = walkDir(ROUTES_DIR)
  let routes = addServerRoutes()
  for (const f of files) {
    if (f.endsWith('.helpers.js') || f.endsWith('index.js') || f.includes('/shared')) continue
    routes.push(...extractRoutesFromFile(f))
  }

  // Dedupe by method+path
  const seen = new Set()
  routes = routes.filter((r) => {
    const key = `${r.method} ${r.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true })
  fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), count: routes.length, routes }, null, 2))
  fs.writeFileSync(OUT_MD, generateMarkdown(routes))

  console.log(`Discovered ${routes.length} routes`)
  console.log(`Wrote ${OUT_JSON}`)
  console.log(`Wrote ${OUT_MD}`)
}

main()
