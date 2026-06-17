#!/usr/bin/env node
/**
 * Generate Supplify-Onboarding-and-Product-Demo.pptx
 * Usage: node scripts/generate-onboarding-pptx.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import pptxgen from 'pptxgenjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/onboarding/output')
const OUT_PPTX = path.join(OUT_DIR, 'Supplify-Onboarding-and-Product-Demo.pptx')

const CREAM = 'FAF7F2'
const CARAMEL = '8B6914'
const CARAMEL_LIGHT = 'C4A574'
const INK = '1A1A1A'
const MUTED = '4A4A4A'
const WHITE = 'FFFFFF'

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim().slice(0, 12)
  } catch {
    return 'unknown'
  }
}

function notes({ message, say, details, value, question, answer, transition }) {
  const parts = []
  if (message) parts.push(`MAIN MESSAGE: ${message}`)
  if (say) parts.push(`\nSAY: ${say}`)
  if (details) parts.push(`\nDETAILS: ${details}`)
  if (value) parts.push(`\nBUSINESS VALUE: ${value}`)
  if (question) parts.push(`\nLIKELY QUESTION: ${question}`)
  if (answer) parts.push(`ANSWER: ${answer}`)
  if (transition) parts.push(`\nTRANSITION: ${transition}`)
  return parts.join('')
}

function addTitleSlide(pptx, title, subtitle, footer) {
  const slide = pptx.addSlide()
  slide.background = { color: CREAM }
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 5.2,
    w: 10,
    h: 0.08,
    fill: { color: CARAMEL },
    line: { color: CARAMEL },
  })
  slide.addText(title, {
    x: 0.6,
    y: 1.6,
    w: 8.8,
    h: 1.2,
    fontSize: 36,
    bold: true,
    color: CARAMEL,
    fontFace: 'Segoe UI',
  })
  slide.addText(subtitle, {
    x: 0.6,
    y: 2.9,
    w: 8.8,
    h: 1,
    fontSize: 16,
    color: MUTED,
    fontFace: 'Segoe UI',
  })
  if (footer) {
    slide.addText(footer, {
      x: 0.6,
      y: 5.5,
      w: 8.8,
      h: 0.4,
      fontSize: 10,
      color: MUTED,
    })
  }
  return slide
}

function addContentSlide(pptx, { title, bullets, internal = false, diagram }) {
  const slide = pptx.addSlide()
  slide.background = { color: CREAM }
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.12,
    h: 5.625,
    fill: { color: CARAMEL },
    line: { color: CARAMEL },
  })
  const titleText = internal ? `${title}  [Internal only]` : title
  slide.addText(titleText, {
    x: 0.45,
    y: 0.35,
    w: 9.2,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: CARAMEL,
    fontFace: 'Segoe UI',
  })
  if (diagram) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 5.1,
      y: 1.1,
      w: 4.5,
      h: 4.0,
      fill: { color: WHITE },
      line: { color: CARAMEL_LIGHT, width: 1 },
      rectRadius: 0.05,
    })
    slide.addText(diagram, {
      x: 5.25,
      y: 1.25,
      w: 4.2,
      h: 3.7,
      fontSize: 11,
      color: INK,
      fontFace: 'Consolas',
      valign: 'top',
    })
    slide.addText(bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), {
      x: 0.45,
      y: 1.1,
      w: 4.5,
      h: 4.2,
      fontSize: 14,
      color: INK,
      fontFace: 'Segoe UI',
      valign: 'top',
    })
  } else {
    slide.addText(bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), {
      x: 0.45,
      y: 1.1,
      w: 9.1,
      h: 4.2,
      fontSize: 15,
      color: INK,
      fontFace: 'Segoe UI',
      valign: 'top',
    })
  }
  return slide
}

const SLIDES = [
  {
    type: 'cover',
    title: 'Supplify',
    subtitle: 'Onboarding & Product Demo\nRestaurant–supplier marketplace & operations platform',
    footer: `v1.0 · ${new Date().toISOString().slice(0, 10)} · commit ${gitCommit()}`,
    speaker: notes({
      message: 'Welcome — Supplify connects restaurants and suppliers end-to-end.',
      say: 'Today I will show how Supplify replaces fragmented ordering, delivery tracking, and invoicing with one platform.',
      transition: 'Start with the problem we solve.',
    }),
  },
  {
    title: 'What Supplify Is',
    bullets: [
      'B2B marketplace: restaurants order from suppliers',
      'Operations: fulfillment, GPS, receiving, finance',
      'FOH: reservations & staff portal',
      'Monetized via Free Trial → Platinum tiers',
      '554 API routes · 80 web routes · 175 migrations',
    ],
    speaker: notes({
      say: 'Supplify is not a catalog-only tool — it runs the full procure-to-pay loop.',
      value: 'One login for purchasing, receiving, and reconciliation.',
      question: 'Is this like a marketplace only?',
      answer: 'Marketplace plus warehouse dispatch, driver GPS, and invoicing.',
      transition: 'Who uses the platform?',
    }),
  },
  {
    title: 'Problems We Solve',
    bullets: [
      'Phone/text orders with no audit trail',
      'Manual delivery coordination',
      'Receiving discrepancies discovered late',
      'Invoice mismatch vs what was delivered',
      'No visibility across multiple suppliers',
    ],
    speaker: notes({
      value: 'Reduces leakage, disputes, and admin hours.',
      transition: 'Meet the user ecosystem.',
    }),
  },
  {
    title: 'User Ecosystem',
    diagram: 'Restaurants ──order──► Suppliers\n    │                    │\n    │                    ├── Drivers\n    │                    └── Warehouses\n    ├── Staff portal\n    ├── Reservations (guests)\n    └── Admin (platform)',
    bullets: [
      'Restaurant & supplier workspaces (RBAC)',
      'Drivers in supplier tenant',
      'Staff self-service at /staff',
      'Guests: /reserve, /supplier/:slug',
      'Platform admin command center',
    ],
    speaker: notes({
      transition: 'Value for suppliers first.',
    }),
  },
  {
    title: 'Supplier Value Proposition',
    bullets: [
      'Catalog, warehouses, multi-branch fulfillment',
      'Dispatch board & driver assignment',
      'Receivables & promotions',
      'Customer growth: import, refer, sponsor',
      'Command center KPIs',
    ],
    speaker: notes({
      say: 'Suppliers run operations and sales from one cockpit.',
      transition: 'Restaurant value next.',
    }),
  },
  {
    title: 'Restaurant Value Proposition',
    bullets: [
      'Multi-supplier catalog & cart checkout',
      'Live delivery tracking (when enabled)',
      'Receiving → auto-invoice path',
      'Inventory, expiry, smart reorder',
      'Reservations & staff labour tools',
    ],
    speaker: notes({
      transition: 'Drivers and operations.',
    }),
  },
  {
    title: 'Driver & Operations Value',
    bullets: [
      'Driver portal: /app/driver-deliveries',
      'Route stops, status, proof of delivery',
      'GPS pings with stale detection (5 min)',
      'Dispatch board for warehouse managers',
      'Delivery rollover for undelivered stops',
    ],
    speaker: notes({
      transition: 'Platform administration.',
    }),
  },
  {
    title: 'Platform Administration',
    bullets: [
      'Tenant directory & health',
      'Plans, trials, limit overrides',
      'Deal approval & growth program',
      'Impersonation for support (audited)',
      'Feature flags per tenant or global',
    ],
    speaker: notes({
      transition: 'Architecture overview — internal slide.',
    }),
  },
  {
    title: 'Product Architecture Overview',
    internal: true,
    diagram: 'Browser (Vite/React)\n       │\n   Express API\n   ├── PostgreSQL\n   ├── Redis\n   ├── Keycloak\n   └── MinIO/S3',
    bullets: [
      'Web SPA + cookie OIDC via API',
      'RTK Query + Redux state',
      '18 background cron jobs',
      'Socket.IO notifications',
      'Railway deployment (dev/preprod/prod)',
    ],
    speaker: notes({
      details: 'No secrets on slides — see handbook Part VII.',
      transition: 'Supplier onboarding journey.',
    }),
  },
  {
    title: 'Supplier Onboarding Journey',
    bullets: [
      '1. Register → Keycloak → /register/complete',
      '2. Activate plan (/app/activate)',
      '3. Profile & warehouses (/app/supplier-settings)',
      '4. Catalog import (CSV / ZIP images)',
      '5. Connect restaurants · fulfill orders',
    ],
    speaker: notes({
      say: 'Navigation: Settings → Products → Fulfillment → Invoices.',
      transition: 'Restaurant journey.',
    }),
  },
  {
    title: 'Restaurant Onboarding Journey',
    bullets: [
      '1. Register & activate subscription',
      '2. Wizard: /app/onboarding (7 tabs)',
      '3. Follow suppliers · browse /app/products',
      '4. Cart → place order → track delivery',
      '5. Receive → inventory → invoices',
    ],
    speaker: notes({
      transition: 'Catalog setup.',
    }),
  },
  {
    title: 'Product & Catalog Setup',
    bullets: [
      'Supplier: CRUD products, categories, pricing',
      'Bulk CSV import + async image ZIP job',
      'Restaurant-specific contract pricing',
      'Public mini-store: /supplier/:slug',
      'Plan limits: SKUs, storage MB',
    ],
    speaker: notes({
      transition: 'Ordering lifecycle — core demo.',
    }),
  },
  {
    title: 'Ordering Lifecycle',
    diagram: 'PLACED → ACK → PROCESSING\n  → SHIPPED → DELIVERED\n  → RECEIVED → INVOICED',
    bullets: [
      'Multi-supplier cart splits orders',
      'Supplier accept / decline / amend',
      'Urgent orders & reminders',
      'Quick lists & scheduled reorders',
      'Status notifications both sides',
    ],
    speaker: notes({
      say: 'Walk order detail timeline on /app/orders/:id.',
      transition: 'Shortages and substitutions.',
    }),
  },
  {
    title: 'Shortage & Substitution Workflow',
    bullets: [
      'Order amendments (Silver+): propose line changes',
      'Counter-party accept / reject',
      'Disputes after delivery for quality/qty',
      'Credit notes applied to invoices',
      'Replacement orders on resolve ($0 lines)',
    ],
    speaker: notes({
      transition: 'Dispatch and delivery.',
    }),
  },
  {
    title: 'Dispatch & Delivery',
    bullets: [
      '/app/fulfillment — dispatch board',
      'Assign driver · build routes · pick lists',
      'Driver updates: picked up → delivered',
      'Proof of delivery photo/GPS/signature',
      'Failed delivery requires reason',
    ],
    speaker: notes({
      transition: 'GPS tracking.',
    }),
  },
  {
    title: 'GPS Tracking',
    bullets: [
      'Driver POST /api/orders/:id/location',
      'Restaurant panel on order detail (sanitized)',
      'Stale badge after ~5 minutes',
      'Env: GPS_TRACKING_ENABLED',
      'Privacy: no driver phone in restaurant view',
    ],
    speaker: notes({
      transition: 'Receiving.',
    }),
  },
  {
    title: 'Receiving',
    bullets: [
      '/app/receiving — pending deliveries queue',
      'Line-level qty & quality capture',
      'Triggers inventory lots + invoice creation',
      'RECEIVED_PARTIAL vs RECEIVED_FULL',
      'Open dispute from receiving path',
    ],
    speaker: notes({
      transition: 'Inventory.',
    }),
  },
  {
    title: 'Inventory',
    bullets: [
      'Restaurant on-hand & par levels',
      'Supplier warehouse stock',
      'Movement ledger & waste entry',
      'Branch-scoped lots (where enabled)',
      'Tier limits on SKU counts',
    ],
    speaker: notes({
      transition: 'Expiry management.',
    }),
  },
  {
    title: 'Expiry Management',
    bullets: [
      'Lot/batch expiry on restaurant inventory',
      'Expiring-soon alerts (configurable days)',
      'Optional capture at receiving',
      'Daily notification deduplication',
      'Feeds reorder assistance panel',
    ],
    speaker: notes({
      transition: 'Reorder assistance.',
    }),
  },
  {
    title: 'Reorder Assistance',
    bullets: [
      'Unified feed: low stock, cadence, expiry',
      'Cadence from order history (≥4 orders)',
      'Forecasts on Gold+ (cached)',
      'AI explain/ask on Platinum (optional)',
      'Quick lists → one-click reorder',
    ],
    speaker: notes({
      transition: 'Finance.',
    }),
  },
  {
    title: 'Invoices & Payments',
    bullets: [
      'Auto-invoice on receiving (supplier)',
      'Restaurant inbox & partial payments',
      'Credit notes from disputes',
      'Supplier record payment (cash/check/transfer)',
      'PDF invoice generation',
    ],
    speaker: notes({
      transition: 'Promotions.',
    }),
  },
  {
    title: 'Promotions & Deals',
    bullets: [
      'Supplier creates deal → admin may approve',
      'Types: % off, fixed, BOGO, free delivery',
      'Restaurant discovers deals · redeems in cart',
      'Paid boosts for catalog visibility',
      'Limits: active deals & redemptions/day',
    ],
    speaker: notes({
      transition: 'Reservations.',
    }),
  },
  {
    title: 'Reservations',
    bullets: [
      'FOH board: /app/reservations',
      'Public guest booking: /reserve/:slug',
      'Waitlist with auto-promotion (Gold+)',
      'Manage/cancel via secure token',
      'Table assignment on seated flow',
    ],
    speaker: notes({
      transition: 'Staff management.',
    }),
  },
  {
    title: 'Staff Management',
    bullets: [
      'Labour center: /app/staff',
      'Schedule, PTO, announcements, documents',
      'Staff portal: /staff/dashboard',
      'Clock in/out & shift swaps',
      'Separate STAFF_PORTAL auth from team RBAC',
    ],
    speaker: notes({
      transition: 'Notifications.',
    }),
  },
  {
    title: 'Notifications',
    bullets: [
      'In-app center + Socket.IO realtime',
      'Email transactional pipeline + retry cron',
      'Web Push (PWA) when plan allows',
      'Per-category user preferences',
      'Order, reservation, staff event triggers',
    ],
    speaker: notes({
      transition: 'Roles and permissions.',
    }),
  },
  {
    title: 'Roles & Permissions',
    bullets: [
      '52 permission keys (ORDERS_VIEW, etc.)',
      '7 restaurant + 9 supplier system roles',
      'Owner = full; Viewer = read-only',
      'Custom roles on Gold+ (advanced_roles)',
      'Backend requirePermission on every mutation',
    ],
    speaker: notes({
      transition: 'Subscription plans.',
    }),
  },
  {
    title: 'Subscription Plans',
    bullets: [
      'Free Trial (time-limited evaluation)',
      'Silver · Gold · Platinum (paid)',
      'Same tier names for restaurant & supplier',
      'Features JSON + numeric limits JSON',
      'Trial expiry → read-only until upgrade',
    ],
    speaker: notes({
      transition: 'Plan comparison.',
    }),
  },
  {
    title: 'Plan Comparison (Summary)',
    bullets: [
      'Free: 3 orders/day, 1 user, basic quick lists',
      'Silver: $49/mo — reports, calendar, warehouses',
      'Gold: $149/mo — drivers, smart reorder, branches',
      'Platinum: $349/mo — AI reorder, advanced finance',
      'See handbook Part X for full matrix',
    ],
    speaker: notes({
      transition: 'Security.',
    }),
  },
  {
    title: 'Security',
    bullets: [
      'Keycloak OIDC · HTTP-only cookies',
      'Tenant isolation on every API query',
      'RBAC + subscription double gate',
      'CSRF on mutating routes',
      'Impersonation audited; billing blocked',
    ],
    speaker: notes({
      transition: 'Deployment — internal.',
    }),
  },
  {
    title: 'Deployment Architecture',
    internal: true,
    diagram: 'Railway:\n  Web · API · Keycloak\n  Postgres · Redis\n  S3/R2 storage',
    bullets: [
      'Environments: dev, preprod, prod',
      'Docker Compose for local full stack',
      'Migrations on API startup',
      'Redis required for multi-replica',
      'See handbook Part VII & GENERATION.md',
    ],
    speaker: notes({
      transition: 'Live demo scenario.',
    }),
  },
  {
    title: 'Demo Scenario (Scripted)',
    bullets: [
      'Prep: pnpm seed:full · Gold demo logins',
      'Restaurant orders from 2 suppliers',
      'Supplier accepts urgent order · dispatches driver',
      'Restaurant tracks · receives with note',
      'Invoice appears · inventory updates',
    ],
    speaker: notes({
      say: 'Use restaurant@supplify.com and supplier@supplify.com for active billing.',
      details: 'Backup if driver not seeded: narrate fulfillment board only.',
      transition: 'Daily supplier workflow.',
    }),
  },
  {
    title: 'Daily Supplier Workflow',
    bullets: [
      'Morning: command center KPIs',
      'Process inbox — accept/decline orders',
      'Pick/pack · assign drivers · dispatch',
      'Record payments on issued invoices',
      'Review promotions & growth prospects',
    ],
    speaker: notes({
      transition: 'Daily restaurant workflow.',
    }),
  },
  {
    title: 'Daily Restaurant Workflow',
    bullets: [
      'Check reorder assistance & quick lists',
      'Place orders before cutoff times',
      'Track in-transit deliveries',
      'Receive & report discrepancies same day',
      'Reconcile invoices in finance tab',
    ],
    speaker: notes({
      transition: 'Onboarding checklist.',
    }),
  },
  {
    title: 'Onboarding Checklist (High Level)',
    bullets: [
      '□ Tenant registered & plan activated',
      '□ Team invited with correct roles',
      '□ Catalog / suppliers connected',
      '□ Test order placed & received',
      '□ Notifications & billing verified',
    ],
    speaker: notes({
      details: 'Full printable lists in handbook Part XIX.',
      transition: 'Common support issues.',
    }),
  },
  {
    title: 'Common Support Issues',
    bullets: [
      '402 Payment Required — trial expired / locked',
      '403 — missing permission or suspended plan',
      'Wrong tenant — check branch switcher',
      'Product not visible — follow/connection + plan',
      'GPS stale — driver permissions or env flags',
    ],
    speaker: notes({
      transition: 'Current limitations.',
    }),
  },
  {
    title: 'Current Limitations (Honest)',
    bullets: [
      'Supplier delivery zones UI not wired to API',
      'Restaurant statement opening balance = 0',
      'Delivery rollover cron off by default',
      'Deal boost billing often waived in dev',
      'Mobile app: separate repo (parity checklist)',
    ],
    speaker: notes({
      transition: 'Roadmap from real gaps only.',
    }),
  },
  {
    title: 'Implementation Roadmap (Code Gaps)',
    bullets: [
      'Wire supplier delivery zones backend',
      'Restaurant opening balance accounting',
      'Dashboard period filter on spend trend',
      'Expand E2E vs 554 API routes',
      'Driver/dispatch seed data for demos',
    ],
    speaker: notes({
      transition: 'Close with next steps.',
    }),
  },
  {
    title: 'Questions & Next Steps',
    bullets: [
      'Full handbook: docs/onboarding/Supplify-Complete-Handbook.pdf',
      'Role guides: 03–06 onboarding docs',
      'Trial extension via admin console',
      'Schedule go-live checklist review',
      'Contact your Supplify onboarding lead',
    ],
    speaker: notes({
      say: 'Thank you — I am happy to deep-dive any workflow or run a tenant-specific walkthrough.',
      message: 'Leave them with handbook PDF and clear onboarding owner.',
    }),
  },
]

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Supplify'
  pptx.company = 'Supplify'
  pptx.subject = 'Onboarding and Product Demo'
  pptx.title = 'Supplify Onboarding and Product Demo'

  for (const def of SLIDES) {
    let slide
    if (def.type === 'cover') {
      slide = addTitleSlide(pptx, def.title, def.subtitle, def.footer)
    } else {
      slide = addContentSlide(pptx, def)
    }
    if (def.speaker) {
      slide.addNotes(def.speaker)
    }
  }

  await pptx.writeFile({ fileName: OUT_PPTX })
  const stat = fs.statSync(OUT_PPTX)
  console.log(`Wrote ${OUT_PPTX} (${SLIDES.length} slides, ${(stat.size / 1024).toFixed(0)} KB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
