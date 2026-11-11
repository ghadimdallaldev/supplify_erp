#!/usr/bin/env node
/**
 * HORECA demo seed: an additive, idempotent, Lebanese-market demo dataset covering every
 * major Supplify feature (tenants, users, catalog, orders in every status, delivery, receiving,
 * finance, disputes, promotions, loyalty, chat, notifications, reviews, B2C shop, staff, admin).
 *
 * SAFETY
 *  - Never deletes or truncates. Every row has a deterministic id (sha1-derived) and is inserted
 *    with ON CONFLICT DO NOTHING, so re-running is safe.
 *  - Refuses to run unless --allow-host=<substring> matches the DATABASE_URL host (printed first)
 *    or the host is localhost. Never run against production.
 *
 * Env (process env only, never committed):
 *   DATABASE_URL                 target Postgres (dev only)
 *   KEYCLOAK_BASE_URL            e.g. https://keycloak-dev.supplifyerp.com
 *   KEYCLOAK_ADMIN_USERNAME / KEYCLOAK_ADMIN_PASSWORD / KEYCLOAK_REALM (default Supplify)
 *   SKIP_KEYCLOAK=true           skip Keycloak user creation
 *   SEED=2026                    RNG seed (default 2026)
 *
 * Usage (from apps/api):
 *   node scripts/seed-horeca-demo.mjs --allow-host=proxy.rlwy.net
 *   node scripts/seed-horeca-demo.mjs --allow-host=... --only=identity,catalog
 *   node scripts/seed-horeca-demo.mjs --arm-logins     # re-arm OTP-free first login (dev demo only)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSeededRng, intBetween, floatBetween, pick, shuffle } from './seed/seedRng.js'
import { SUPPLIERS, RESTAURANTS, PLATFORM_ADMIN, DEMO_PASSWORD, RELATIONS } from './seed/horeca-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const flag = (name) => argv.includes(`--${name}`)

// ---------------------------------------------------------------------------------------------
// Safety guard (before importing anything that opens a pool)
// ---------------------------------------------------------------------------------------------
const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}
const dbParsed = new URL(dbUrl)
console.log(`Target database: host=${dbParsed.hostname} port=${dbParsed.port || 5432} db=${dbParsed.pathname.slice(1)}`)
const allowHost = arg('allow-host')
const isLocal = ['localhost', '127.0.0.1'].includes(dbParsed.hostname)
if (!isLocal && !(allowHost && dbParsed.hostname.includes(allowHost))) {
  console.error('Refusing to run: pass --allow-host=<substring of the DB host> to confirm the target.')
  process.exit(1)
}
if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
  console.error('Refusing to run with NODE_ENV=production.')
  process.exit(1)
}
process.env.APP_ENV = process.env.APP_ENV || 'dev'
process.env.NODE_ENV = process.env.NODE_ENV || 'development'

// The app config can silently redirect DATABASE_URL to the local Docker DB (.env.docker-sync);
// SUPPLIFY_DATABASE_URL always wins, so pin it to the verified target.
process.env.SUPPLIFY_DATABASE_URL = dbUrl
const { pool } = await import('../src/lib/db.js')
const { config: appConfig } = await import('../src/config/env.js')
{
  const effective = new URL(appConfig.DATABASE_URL)
  if (effective.hostname !== dbParsed.hostname || effective.port !== dbParsed.port) {
    console.error(`Refusing to run: app pool targets ${effective.hostname}:${effective.port}, not the verified target.`)
    process.exit(1)
  }
}
const tenantRoles = await import('../src/lib/tenant-roles.js')
const supplierOrg = await import('../src/lib/supplier-org.js')
const restaurantOrg = await import('../src/lib/restaurant-org.js')

const IMAGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed/horeca-images.json'), 'utf8'))
IMAGES.pomegranate_molasses ||= IMAGES.pomegranate
const img = (key) => IMAGES[key] || IMAGES.produce_market || null

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
const SEED = parseInt(process.env.SEED || '2026', 10)
const rng = createSeededRng(SEED)
const NOW = new Date()
const DAY = 86400000
const ago = (days, hour = null, minute = 0) => {
  const d = new Date(NOW.getTime() - days * DAY)
  if (hour != null) d.setUTCHours(hour, minute, 0, 0)
  return d
}
const isoDate = (d) => d.toISOString().slice(0, 10)
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

function uid(...parts) {
  const h = crypto.createHash('sha1').update(`horeca-demo|${parts.join('|')}`).digest('hex')
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
  return v
}

const q = (s) => `"${s}"`
function norm(v) {
  if (v === undefined) return null
  if (v === null || v instanceof Date) return v
  if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return JSON.stringify(v)
  return v
}
/** Multi-row INSERT ... ON CONFLICT DO NOTHING (rows must share the same keys). */
async function bulk(c, table, rows, { conflict = 'ON CONFLICT DO NOTHING', chunk = 120, raw = {} } = {}) {
  if (!rows.length) return 0
  const cols = Object.keys(rows[0])
  let n = 0
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk)
    const vals = []
    const ph = part
      .map(
        (r) =>
          '(' +
          cols
            .map((col) => {
              vals.push(raw[col] ? r[col] : norm(r[col]))
              return `$${vals.length}`
            })
            .join(',') +
          ')'
      )
      .join(',')
    const res = await c.query(
      `INSERT INTO ${table} (${cols.map(q).join(',')}) VALUES ${ph} ${conflict}`,
      vals
    )
    n += res.rowCount
  }
  return n
}
const log = (...a) => console.log(...a)

const state = {
  users: new Map(), // email -> {id, sub, kind, ...}
  suppliers: new Map(), // key -> {id, orgId, def, products[], warehouses[]}
  restaurants: new Map(),
  admin: null,
}

const PLAN_ID = {
  SUPPLIER: { free: null, gold: null, platinum: null },
  RESTAURANT: { free: null, silver: null, gold: null, platinum: null },
}

// ---------------------------------------------------------------------------------------------
// Keycloak
// ---------------------------------------------------------------------------------------------
const KC_BASE = (process.env.KEYCLOAK_BASE_URL || 'http://localhost:8180').replace(/\/$/, '')
const KC_REALM = process.env.KEYCLOAK_REALM || 'Supplify'

async function kcToken() {
  const res = await fetch(`${KC_BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
    }),
  })
  if (!res.ok) throw new Error(`Keycloak admin token failed: ${res.status}`)
  return (await res.json()).access_token
}

async function kcCall(token, method, p, body) {
  const res = await fetch(`${KC_BASE}/admin/realms/${KC_REALM}${p}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res
}

/** Create or update a Keycloak user. Returns its id (the JWT `sub`). */
async function ensureKcUser(token, u, roleCache) {
  const found = await (await kcCall(token, 'GET', `/users?email=${encodeURIComponent(u.email)}&exact=true`)).json()
  let id = found[0]?.id
  const rep = {
    username: u.email,
    email: u.email,
    firstName: u.first,
    lastName: u.last,
    enabled: true,
    emailVerified: true,
  }
  if (!id) {
    const res = await kcCall(token, 'POST', '/users', {
      ...rep,
      credentials: [{ type: 'password', value: DEMO_PASSWORD, temporary: false }],
    })
    if (res.status === 409) {
      const again = await (await kcCall(token, 'GET', `/users?username=${encodeURIComponent(u.email)}&exact=true`)).json()
      id = again[0]?.id
    } else if (!res.ok) {
      throw new Error(`create ${u.email}: ${res.status} ${await res.text()}`)
    } else {
      id = res.headers.get('location').split('/').pop()
    }
  } else {
    await kcCall(token, 'PUT', `/users/${id}`, { ...found[0], ...rep })
  }
  await kcCall(token, 'PUT', `/users/${id}/reset-password`, {
    type: 'password',
    value: DEMO_PASSWORD,
    temporary: false,
  })
  const roleName = u.kind === 'admin' ? 'admin' : u.kind
  if (!roleCache[roleName]) {
    roleCache[roleName] = await (await kcCall(token, 'GET', `/roles/${roleName}`)).json()
  }
  const have = await (await kcCall(token, 'GET', `/users/${id}/role-mappings/realm`)).json()
  if (!have.some((r) => r.name === roleName)) {
    await kcCall(token, 'POST', `/users/${id}/role-mappings/realm`, [
      { id: roleCache[roleName].id, name: roleName },
    ])
  }
  return id
}

function allDemoUsers() {
  const list = []
  for (const s of SUPPLIERS) {
    list.push({ ...s.owner, kind: 'supplier', tenantKey: s.key, roleName: 'Owner', owner: true })
    for (const t of s.team) list.push({ ...t, kind: 'supplier', tenantKey: s.key, roleName: t.role })
  }
  for (const r of RESTAURANTS) {
    list.push({ ...r.owner, kind: 'restaurant', tenantKey: r.key, roleName: 'Owner', owner: true })
    for (const t of r.team) list.push({ ...t, kind: 'restaurant', tenantKey: r.key, roleName: t.role })
  }
  list.push({ ...PLATFORM_ADMIN, kind: 'admin', tenantKey: null, roleName: 'Super Admin' })
  return list
}

async function sectionKeycloak() {
  const users = allDemoUsers()
  if (!flag('with-keycloak')) {
    // Default: Keycloak users are provisioned separately; reuse their real subs from app_user.
    const { rows } = await pool.query(
      'SELECT id, email, keycloak_sub FROM app_user WHERE LOWER(email) = ANY($1)',
      [users.map((u) => u.email.toLowerCase())]
    )
    const byEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r]))
    const missing = users.filter((u) => !byEmail.has(u.email.toLowerCase()))
    if (missing.length) throw new Error('Demo users missing from app_user (run with --with-keycloak): ' + missing.map((u) => u.email).join(', '))
    for (const u of users) {
      const r = byEmail.get(u.email.toLowerCase())
      state.users.set(u.email, { ...u, sub: r.keycloak_sub, id: r.id })
    }
    log('Keycloak step skipped; reusing ' + users.length + ' existing app_user identities')
    return
  }
  if (process.env.SKIP_KEYCLOAK === 'true') {
    log('Keycloak skipped; generating placeholder subs (logins will NOT work)')
    for (const u of users) state.users.set(u.email, { ...u, sub: uid('kc-sub', u.email) })
    return
  }
  const token = await kcToken()
  const roleCache = {}
  for (const u of users) {
    const sub = await ensureKcUser(token, u, roleCache)
    state.users.set(u.email, { ...u, sub })
  }
  log(`Keycloak: ${users.length} users ensured (password set, emailVerified=true)`)
}

/** Dev demo helper: mark users so their next browser login skips the email OTP step. */
async function armLogins() {
  const token = await kcToken()
  let n = 0
  for (const u of allDemoUsers()) {
    const found = await (await kcCall(token, 'GET', `/users?email=${encodeURIComponent(u.email)}&exact=true`)).json()
    const ex = found[0]
    if (!ex) continue
    const attributes = { ...(ex.attributes || {}), supplify_driver_login: ['true'] }
    const res = await kcCall(token, 'PUT', `/users/${ex.id}`, {
      username: ex.username,
      email: ex.email,
      firstName: ex.firstName,
      lastName: ex.lastName,
      enabled: ex.enabled,
      emailVerified: ex.emailVerified,
      attributes,
    })
    if (res.ok) n++
  }
  log(`Armed ${n} demo logins (next login skips OTP; the API clears the flag for non-drivers after login).`)
}

// ---------------------------------------------------------------------------------------------
// Identity + tenants
// ---------------------------------------------------------------------------------------------
async function sectionIdentity() {
  const c = pool
  // Plans
  const { rows: plans } = await c.query(
    `SELECT id, code, tenant_type FROM subscription_plan WHERE is_active = true`
  )
  for (const p of plans) PLAN_ID[p.tenant_type][p.code] = p.id
  const planRow = async (tenantType, code) => {
    const { rows } = await c.query(`SELECT id, name FROM subscription_plan WHERE id = $1`, [PLAN_ID[tenantType][code]])
    return rows[0]
  }

  // app_user rows
  const userRows = []
  for (const u of state.users.values()) {
    const role = u.kind === 'admin' ? 'ADMIN' : u.kind.toUpperCase()
    const id = uid('user', u.email)
    u.id = id
    userRows.push({
      id,
      keycloak_sub: u.sub,
      email: u.email.toLowerCase(),
      display_name: `${u.first} ${u.last}`,
      role,
      preferred_locale: 'en',
      is_active: true,
      created_at: ago(120),
      updated_at: ago(1),
    })
  }
  for (const r of userRows) {
    await c.query(
      `INSERT INTO app_user (id, keycloak_sub, email, display_name, role, preferred_locale, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (email) DO UPDATE SET keycloak_sub = COALESCE(app_user.keycloak_sub, EXCLUDED.keycloak_sub), display_name = EXCLUDED.display_name,
         role = EXCLUDED.role, is_active = true, updated_at = now()`,
      [r.id, r.keycloak_sub, r.email, r.display_name, r.role, r.preferred_locale, r.is_active, r.created_at, r.updated_at]
    )
  }
  // Resolve actual ids (email conflict keeps the original id)
  const { rows: ids } = await c.query(`SELECT id, email FROM app_user WHERE email = ANY($1)`, [
    [...state.users.keys()].map((e) => e.toLowerCase()),
  ])
  for (const r of ids) {
    const u = state.users.get([...state.users.keys()].find((e) => e.toLowerCase() === r.email))
    if (u) u.id = r.id
  }
  state.admin = [...state.users.values()].find((u) => u.kind === 'admin')
  log(`app_user: ${ids.length} demo users`)

  // ---- Supplier tenants
  for (const s of SUPPLIERS) {
    const id = uid('supplier', s.key)
    const orgId = uid('supplier-org', s.key)
    const addr = { street: s.area, city: s.city, country: 'Lebanon', latitude: s.lat, longitude: s.lng }
    await c.query(
      `INSERT INTO supplier_organizations (id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)
       ON CONFLICT DO NOTHING`,
      [orgId, s.name, `${s.slug}-org`, ago(110)]
    )
    const multi = s.warehouses.length > 1
    await c.query(
      `INSERT INTO supplier (id, name, slug, vat_no, contact_email, phone, address_json, created_at, updated_at, logo_url,
         legal_name, tax_id, sales_contact_email, sales_contact_phone, accounting_contact_email, logistics_contact_email,
         business_hours_json, return_policy, minimum_order_amount, payment_terms, terms_and_conditions, subscription_tier,
         account_status, multi_warehouse_enabled, fulfillment_mode, organization_id, is_main_branch, brand_primary, brand_accent,
         brand_display_name, public_catalog_enabled, pod_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,'ACTIVE',$22,$23,$24,true,$25,$26,$2::text,true,true)
       ON CONFLICT (slug) DO NOTHING`,
      [
        id, s.name, s.slug, `LB-VAT-${(100000 + intBetween(rng, 1, 899999))}`, s.owner.email, s.phone, JSON.stringify(addr), ago(110), img(s.logoImg),
        `${s.name} S.A.L.`, `TIN-${intBetween(rng, 1000000, 9999999)}`, s.owner.email, s.phone,
        `accounts@${s.owner.email.split('@')[1]}`, `dispatch@${s.owner.email.split('@')[1]}`,
        JSON.stringify({ mon: '06:00-18:00', tue: '06:00-18:00', wed: '06:00-18:00', thu: '06:00-18:00', fri: '06:00-18:00', sat: '06:00-14:00', sun: 'closed' }),
        'Fresh and chilled goods must be reported within 24 hours of delivery. Dry goods within 7 days if unopened.',
        s.minOrder, s.paymentTerms, 'Standard HORECA supply terms. Prices in USD, exclusive of delivery outside Greater Beirut.',
        s.plan.toUpperCase(), multi, multi ? 'multi' : 'single', orgId,
        ['#0f766e', '#b45309', '#1d4ed8', '#9f1239', '#4d7c0f', '#6d28d9', '#0e7490'][SUPPLIERS.indexOf(s)] || '#0f766e', '#f59e0b',
      ]
    )
    const { rows: sRow } = await c.query(`SELECT id, organization_id FROM supplier WHERE slug = $1`, [s.slug])
    const rec = { id: sRow[0].id, orgId: sRow[0].organization_id, def: s, products: [], warehouses: [], categories: new Map() }
    state.suppliers.set(s.key, rec)
    await c.query(
      `INSERT INTO supplier_contact_info (supplier_id, email, email_verified, phone, phone_verified) VALUES ($1,$2,true,$3,true)
       ON CONFLICT DO NOTHING`,
      [rec.id, s.owner.email, s.phone]
    )
    await c.query(
      `INSERT INTO catalog (id, supplier_id, name, is_active, created_at, updated_at) VALUES ($1,$2,$3,true,$4,$4) ON CONFLICT DO NOTHING`,
      [uid('catalog', s.key), rec.id, `${s.name} Catalog`, ago(100)]
    )
    // subscription
    const plan = await planRow('SUPPLIER', s.plan)
    const { rows: hasSub } = await c.query(`SELECT 1 FROM subscription WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER'`, [rec.id])
    if (!hasSub.length) {
      await c.query(
        `INSERT INTO subscription (id, tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start,
           current_period_end, next_billing_date, auto_renew, last_payment_at, billing_email, created_at, updated_at)
         VALUES ($1,$2,'SUPPLIER',$3,$4,'ACTIVE','MONTHLY',$5,$6,$6,true,$5,$7,$8,$5)`,
        [uid('sub', s.key), rec.id, plan.id, plan.name, ago(12), new Date(NOW.getTime() + 18 * DAY), s.owner.email, ago(100)]
      )
    }
    await tenantRoles.ensureTenantSystemRoles(rec.id, 'SUPPLIER')
    await supplierOrg.ensureOrgSystemRoles(rec.orgId)
    // warehouses
    for (const w of s.warehouses) {
      const wid = uid('warehouse', s.key, w.code)
      await c.query(
        `INSERT INTO warehouse (id, supplier_id, tenant_id, name, code, address_json, address, is_active, is_main, is_default, type,
           capacity_sqm, operating_hours, contact_name, contact_email, contact_phone, delivery_coverage_zones, created_at, updated_at)
         VALUES ($1,$2,$2,$3,$4,$5::jsonb,$5::jsonb,true,$6,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb,$14,$14)
         ON CONFLICT (id) DO NOTHING`,
        [
          wid, rec.id, w.name, w.code, JSON.stringify({ city: w.name.includes('Zahle') ? 'Zahle' : w.name.includes('Saida') ? 'Saida' : s.city, country: 'Lebanon' }),
          w.main, w.type, intBetween(rng, 400, 2400), JSON.stringify({ mon_sat: '05:00-19:00' }),
          s.owner.first + ' ' + s.owner.last, s.owner.email, s.phone,
          JSON.stringify(w.main ? ['Beirut', 'Mount Lebanon', 'Metn', 'Keserwan'] : ['Bekaa', 'South Lebanon']), ago(100),
        ]
      )
      rec.warehouses.push({ ...w, id: wid })
    }
    await c.query(`UPDATE supplier SET default_warehouse_id = $1 WHERE id = $2 AND default_warehouse_id IS NULL`, [
      rec.warehouses.find((w) => w.main).id, rec.id,
    ])
    // tax / reminders / delivery zones
    await bulk(c, 'tax_config', [
      { id: uid('tax', s.key), supplier_id: rec.id, tax_name: 'Lebanon VAT', tax_rate: 11, tax_type: 'VAT', region: 'Lebanon', country: 'LB', is_active: true, effective_from: '2024-01-01', created_at: ago(100), updated_at: ago(100) },
    ])
    await bulk(c, 'payment_reminder_config', [
      { id: uid('prc', s.key), supplier_id: rec.id, reminder_enabled: true, days_before_due: 3, days_after_due: 7, reminder_frequency_days: 7, max_reminders: 3, reminder_template: 'Friendly reminder: invoice {{invoice_number}} is due on {{due_date}}.', created_at: ago(90), updated_at: ago(90) },
    ])
    await bulk(c, 'delivery_zone', [
      { id: uid('zone', s.key, 'beirut'), supplier_id: rec.id, warehouse_id: rec.warehouses[0].id, name: 'Greater Beirut', coverage_area_json: { cities: ['Beirut', 'Metn', 'Baabda'] }, delivery_fee: 0, min_order_amount: s.minOrder, delivery_time_days: 1, is_active: true, zone_type: 'radius', radius_km: 25, center_lat: s.lat, center_lng: s.lng, estimated_delivery_hours: 12 },
      { id: uid('zone', s.key, 'north'), supplier_id: rec.id, warehouse_id: rec.warehouses[0].id, name: 'North Coast (Jounieh - Byblos - Batroun)', coverage_area_json: { cities: ['Jounieh', 'Byblos', 'Batroun'] }, delivery_fee: 6, min_order_amount: s.minOrder + 40, delivery_time_days: 1, is_active: true, zone_type: 'radius', radius_km: 55, center_lat: 34.12, center_lng: 35.65, estimated_delivery_hours: 24 },
    ]).catch((e) => log('  delivery_zone skipped:', e.message))
  }
  log(`suppliers: ${state.suppliers.size}`)

  // ---- Restaurant tenants (+ orgs + branch accounts)
  const orgIds = new Map()
  for (const r of RESTAURANTS) {
    const id = uid('restaurant', r.key)
    const orgName = r.org || r.name
    const orgSlug = r.orgSlug || (r.org ? r.org.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `${r.slug}-org`)
    const orgId = orgIds.get(orgName) || uid('restaurant-org', orgName)
    orgIds.set(orgName, orgId)
    await c.query(
      `INSERT INTO restaurant_organizations (id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,$4,$4) ON CONFLICT DO NOTHING`,
      [orgId, orgName, orgSlug, ago(110)]
    )
    const addr = { street: r.area, city: r.city, country: 'Lebanon', latitude: r.lat, longitude: r.lng }
    const emailDomain = r.owner.email.split('@')[1]
    await c.query(
      `INSERT INTO restaurant (id, name, slug, trade_license_no, contact_email, phone, address_json, created_at, updated_at,
         business_type, registration_number, tax_id, vat_number, logo_url, operating_hours, delivery_instructions, subscription_tier,
         account_status, organization_id, is_main_branch, branch_code, is_branch_active, delivery_latitude, delivery_longitude,
         delivery_location_label, delivery_address_notes, brand_primary, brand_accent, brand_display_name, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,'ACTIVE',$17,$18,$19,true,$20,$21,$22,$23,$24,$25,$2::text,'Asia/Beirut')
       ON CONFLICT (slug) DO NOTHING`,
      [
        id, r.name, r.slug, `TL-${intBetween(rng, 10000, 99999)}`, r.owner.email, r.phone, JSON.stringify(addr), ago(105),
        r.type, `CR-${intBetween(rng, 100000, 999999)}`, `TIN-${intBetween(rng, 1000000, 9999999)}`, `LB-VAT-${intBetween(rng, 100000, 999999)}`,
        img(r.logoImg), JSON.stringify({ mon_sun: '08:00-23:30' }), 'Deliver to the service entrance. Ring the bell twice; receiving staff on duty 06:00-12:00.',
        (r.plan || 'free').toUpperCase(), orgId, r.main === true || !r.branch, r.branchCode || null, r.lat, r.lng,
        `${r.name} service entrance`, `${r.area}, ${r.city}`, ['#be123c', '#0f766e', '#a16207', '#1e40af', '#7c2d12', '#166534'][RESTAURANTS.indexOf(r) % 6], '#f59e0b',
      ]
    )
    const { rows: rRow } = await c.query(`SELECT id, organization_id FROM restaurant WHERE slug = $1`, [r.slug])
    const rec = { id: rRow[0].id, orgId: rRow[0].organization_id, def: r }
    state.restaurants.set(r.key, rec)
    await c.query(
      `INSERT INTO restaurant_contact_info (restaurant_id, email, email_verified, phone, phone_verified) VALUES ($1,$2,true,$3,true)
       ON CONFLICT DO NOTHING`,
      [rec.id, r.owner.email, r.phone]
    )
    const planCode = r.branch ? 'free' : r.plan
    const plan = await planRow('RESTAURANT', planCode)
    const { rows: hasSub } = await c.query(`SELECT 1 FROM subscription WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT'`, [rec.id])
    if (!hasSub.length) {
      await c.query(
        `INSERT INTO subscription (id, tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start,
           current_period_end, next_billing_date, auto_renew, last_payment_at, billing_email, created_at, updated_at)
         VALUES ($1,$2,'RESTAURANT',$3,$4,'ACTIVE','MONTHLY',$5,$6,$6,true,$7,$8,$9,$5)`,
        [uid('sub', r.key), rec.id, plan.id, plan.name, ago(9), new Date(NOW.getTime() + 21 * DAY), planCode === 'free' ? null : ago(9), r.owner.email, ago(100)]
      )
    }
    await tenantRoles.ensureTenantSystemRoles(rec.id, 'RESTAURANT')
    await restaurantOrg.ensureRestaurantOrgSystemRoles(rec.orgId)
  }
  log(`restaurants: ${state.restaurants.size}`)

  // ---- Memberships + roles
  for (const u of state.users.values()) {
    if (u.kind === 'admin') continue
    const t = (u.kind === 'supplier' ? state.suppliers : state.restaurants).get(u.tenantKey)
    const type = u.kind.toUpperCase()
    await c.query(
      `INSERT INTO user_workspace_membership (id, user_id, workspace_type, organization_id, home_tenant_id, is_main_admin, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active') ON CONFLICT (user_id) DO NOTHING`,
      [uid('membership', u.email), u.id, type, t.orgId, t.id, u.owner === true && !t.def.branch]
    )
    const { rows: rr } = await c.query(
      `SELECT id FROM tenant_roles WHERE tenant_id = $1 AND tenant_type = $2 AND name = $3 AND is_system = true LIMIT 1`,
      [t.id, type, u.roleName]
    )
    if (!rr[0]) throw new Error(`system role not found: ${u.roleName} for ${u.tenantKey}`)
    await c.query(
      `INSERT INTO tenant_user_roles (id, user_id, role_id, tenant_type, tenant_id, assigned_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, tenant_id, tenant_type) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [uid('tur', u.email, t.id), u.id, rr[0].id, type, t.id, ago(90)]
    )
    // Org-level roles for primary owners
    if (u.owner && !t.def.branch) {
      if (type === 'SUPPLIER') await supplierOrg.assignOrgUserRole({ userId: u.id, organizationId: t.orgId, roleName: 'Org Owner' })
      else await restaurantOrg.assignRestaurantOrgUserRole({ userId: u.id, organizationId: t.orgId, roleName: 'Org Owner' })
    }
  }
  // Platform admin: Super Admin role (user_role, tenant_id NULL)
  if (state.admin) {
    await c.query(
      `INSERT INTO user_role (user_id, role_id, tenant_id, tenant_type)
       SELECT $1, r.id, NULL, 'ADMIN' FROM role r WHERE r.code = 'SUPER_ADMIN' AND r.tenant_type = 'ADMIN'
         AND NOT EXISTS (SELECT 1 FROM user_role ur WHERE ur.user_id = $1 AND ur.role_id = r.id)`,
      [state.admin.id]
    )
  }
  // Riviera: Nour (manager) is Org Manager; Rami + Nour can see every branch
  const rivieraMain = state.restaurants.get('riviera')
  const nour = state.users.get('nour.khoury@rivierahotels.demo')
  if (nour) await restaurantOrg.assignRestaurantOrgUserRole({ userId: nour.id, organizationId: rivieraMain.orgId, roleName: 'Org Manager' })
  for (const [key, rec] of state.restaurants) {
    if (rec.orgId !== rivieraMain.orgId) continue
    for (const email of ['rami.haddad@rivierahotels.demo', 'nour.khoury@rivierahotels.demo']) {
      const u = state.users.get(email)
      if (u) await restaurantOrg.grantRestaurantOrgBranchAccess({ userId: u.id, restaurantId: rec.id, organizationId: rec.orgId })
    }
  }
  log('memberships and roles assigned')

  // ---- Drivers
  for (const s of SUPPLIERS) {
    const rec = state.suppliers.get(s.key)
    rec.drivers = []
    for (const t of s.team.filter((x) => x.driver)) {
      const u = state.users.get(t.email)
      const did = uid('driver', t.email)
      await c.query(
        `INSERT INTO drivers (id, supplier_id, warehouse_id, full_name, phone, vehicle_type, vehicle_plate, notes, is_active, user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$10) ON CONFLICT (id) DO NOTHING`,
        [did, rec.id, rec.warehouses[0].id, `${t.first} ${t.last}`, `+961 3 ${intBetween(rng, 100, 999)} ${intBetween(rng, 100, 999)}`, t.vehicle, t.plate, 'Demo driver account', u.id, ago(80)]
      )
      rec.drivers.push({ id: did, name: `${t.first} ${t.last}`, userId: u.id, email: t.email })
    }
  }
  log('drivers seeded')
}

// ---------------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------------
function initials(s) {
  return s.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

async function sectionCatalog() {
  const c = pool
  const onlySup = arg('supplier')?.split(',')
  for (const s of SUPPLIERS) {
    if (onlySup && !onlySup.includes(s.key)) continue
    const rec = state.suppliers.get(s.key)
    const productRows = []
    const priceRows = []
    const catRows = []
    let idx = 0
    const catIds = {}
    for (const [cat, items] of Object.entries(s.categories)) {
      const catId = uid('pcat', s.key, cat)
      catIds[cat] = catId
      catRows.push({ id: catId, name: cat, slug: `${s.key}-${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, description: `${cat} from ${s.name}`, display_order: catRows.length, is_active: true, supplier_id: rec.id, created_at: ago(100), updated_at: ago(100) })
      for (const it of items) {
        idx += 1
        const sku = `${s.skuPrefix}-${initials(cat)}-${String(idx).padStart(3, '0')}`
        const id = uid('product', s.key, sku)
        const p = { id, sku, name: it.name, ar: it.ar, unit: it.unit, price: it.price, cat, catId, imgKey: it.img }
        rec.products.push(p)
        productRows.push({
          id, supplier_id: rec.id, sku, name: it.name, name_ar: it.ar,
          description: `${it.name}. Supplied by ${s.name}, packed for professional kitchens.`,
          description_ar: it.ar, brand: it.brand || s.name, category: cat, image_url: img(it.img), image_thumb_url: img(it.img),
          unit: it.unit, tags: [cat.toLowerCase(), 'horeca'], category_id: catId, created_at: ago(100), updated_at: ago(30),
        })
        priceRows.push({ id: uid('price', id, 'base'), product_id: id, currency: 'USD', amount: it.price, min_qty: 1, valid_from: ago(110), valid_to: null })
        const bulkQty = ['kg', 'bunch', 'each'].includes(it.unit) ? 20 : it.unit === 'case' ? 5 : 6
        priceRows.push({ id: uid('price', id, 'tier'), product_id: id, currency: 'USD', amount: r2(it.price * 0.94), min_qty: bulkQty, valid_from: ago(110), valid_to: null })
      }
    }
    await bulk(c, 'product_category', catRows)
    await bulk(c, 'product', productRows)
    await bulk(c, 'price', priceRows)
    rec.catIds = catIds

    // Stock: inventory (trigger created a 0-row), warehouse_inventory, settings, alerts
    const whs = rec.warehouses
    const invUpdates = []
    const whRows = []
    const alertRows = []
    const settingRows = []
    for (const [i, p] of rec.products.entries()) {
      let total
      const roll = rng()
      const threshold = ['kg', 'bunch', 'each'].includes(p.unit) ? 40 : 15
      if (roll < 0.035) total = 0
      else if (roll < 0.1) total = intBetween(rng, 1, threshold - 1)
      else total = intBetween(rng, threshold * 3, threshold * 14)
      p.stock = total
      p.threshold = threshold
      invUpdates.push([p.id, total, whs[0].id])
      let remaining = total
      whs.forEach((w, wi) => {
        const qty = wi === whs.length - 1 ? remaining : Math.floor(total * w.share)
        remaining -= qty
        whRows.push({ id: uid('whinv', w.id, p.id), warehouse_id: w.id, product_id: p.id, quantity_available: qty, quantity_reserved: 0, quantity_on_hand: qty, reorder_point: threshold, reorder_quantity: threshold * 6, last_counted_at: ago(intBetween(rng, 1, 14)), updated_at: ago(1) })
      })
      settingRows.push({ product_id: p.id, moq: 1, order_multiple: 1, lead_time_days: s.key === 'phoenicia' || s.key === 'cedar' ? 0 : 1, low_stock_threshold: threshold, backorder_allowed: false, backorder_eta_days: 0, updated_at: ago(5) })
      if (total === 0) alertRows.push({ id: uid('alert', p.id), product_id: p.id, warehouse_id: whs[0].id, alert_type: 'OUT_OF_STOCK', threshold_value: threshold, current_value: 0, is_acknowledged: false, created_at: ago(intBetween(rng, 0, 3)) })
      else if (total < threshold) alertRows.push({ id: uid('alert', p.id), product_id: p.id, warehouse_id: whs[0].id, alert_type: 'LOW_STOCK', threshold_value: threshold, current_value: total, is_acknowledged: false, created_at: ago(intBetween(rng, 0, 4)) })
    }
    for (const [pid, qty, wid] of invUpdates) {
      await c.query(`UPDATE inventory SET available_qty = $2, warehouse_id = $3, reserved_qty = 0, updated_at = now() WHERE product_id = $1`, [pid, qty, wid])
    }
    await bulk(c, 'warehouse_inventory', whRows, { conflict: 'ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity_available = EXCLUDED.quantity_available, quantity_on_hand = EXCLUDED.quantity_on_hand, reorder_point = EXCLUDED.reorder_point' })
    for (const st of settingRows) {
      await c.query(`UPDATE product_inventory_settings SET low_stock_threshold = $2, lead_time_days = $3, updated_at = now() WHERE product_id = $1`, [st.product_id, st.low_stock_threshold, st.lead_time_days])
    }
    await bulk(c, 'inventory_alert', alertRows)
    log(`catalog ${s.name}: ${rec.products.length} products, ${alertRows.length} stock alerts`)
  }
}


// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------
const SECTIONS = [
  ['keycloak', sectionKeycloak],
  ['identity', sectionIdentity],
  ['catalog', sectionCatalog],
]
const extra = await import('./seed/horeca-sections.mjs').catch((e) => {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e
  return null
})
if (extra?.register) extra.register(SECTIONS, { createSeededRng, bulk, uid, state, pool, rng, ago, NOW, DAY, r2, isoDate, log, img, intBetween, floatBetween, pick, shuffle, tenantRoles, supplierOrg, restaurantOrg, IMAGES, RELATIONS, DEMO_PASSWORD, __dirname })

/** Rebuild in-memory state from the DB so later sections can run alone (--only=...). */
async function hydrate() {
  const c = pool
  for (const s of SUPPLIERS) {
    const { rows } = await c.query('SELECT id, organization_id FROM supplier WHERE slug = $1', [s.slug])
    if (!rows[0]) continue
    const rec = { id: rows[0].id, orgId: rows[0].organization_id, def: s, products: [], warehouses: [], drivers: [] }
    const { rows: whs } = await c.query('SELECT id, code, name, is_main FROM warehouse WHERE supplier_id = $1 ORDER BY is_main DESC, code', [rec.id])
    rec.warehouses = whs.map((w) => ({ id: w.id, code: w.code, name: w.name, main: w.is_main }))
    const { rows: prods } = await c.query(
      `SELECT p.id, p.sku, p.name, p.unit, p.category, p.category_id, p.image_url, (SELECT amount FROM price pr WHERE pr.product_id = p.id AND pr.min_qty = 1 LIMIT 1) AS price,
              COALESCE(i.available_qty, 0) AS stock FROM product p LEFT JOIN inventory i ON i.product_id = p.id WHERE p.supplier_id = $1 ORDER BY p.sku`, [rec.id])
    rec.products = prods.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, cat: p.category, catId: p.category_id, price: Number(p.price), stock: Number(p.stock), image: p.image_url }))
    const { rows: drv } = await c.query('SELECT d.id, d.full_name, d.user_id, u.email FROM drivers d LEFT JOIN app_user u ON u.id = d.user_id WHERE d.supplier_id = $1', [rec.id])
    rec.drivers = drv.map((d) => ({ id: d.id, name: d.full_name, userId: d.user_id, email: d.email }))
    state.suppliers.set(s.key, rec)
  }
  for (const r of RESTAURANTS) {
    const { rows } = await c.query('SELECT id, organization_id FROM restaurant WHERE slug = $1', [r.slug])
    if (rows[0]) state.restaurants.set(r.key, { id: rows[0].id, orgId: rows[0].organization_id, def: r })
  }
  state.admin = [...state.users.values()].find((u) => u.kind === 'admin')
}

async function main() {
  if (flag('arm-logins')) {
    await armLogins()
    return
  }
  const only = arg('only')?.split(',')
  const t0 = Date.now()
  for (const [name, fn] of SECTIONS) {
    if (name === 'keycloak') {
      await fn()
      continue
    }
    if (only && !only.includes(name)) continue
    if (only && !only.includes('identity') && !state.suppliers.size) await hydrate()
    log(`
== ${name} ==`)
    await fn()
  }
  log(`
Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main()
  .catch((e) => {
    console.error('SEED FAILED:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => {})
    process.exit(process.exitCode || 0)
  })
