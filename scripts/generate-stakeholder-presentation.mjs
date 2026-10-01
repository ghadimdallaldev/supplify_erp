#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pptxgen from 'pptxgenjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.SUPPLIFY_PPTX_OUT
  ? path.resolve(process.env.SUPPLIFY_PPTX_OUT)
  : path.join(ROOT, 'SUPPLIFY_Stakeholder_Presentation.pptx')
const NOTES = path.join(ROOT, 'SUPPLIFY_PRESENTATION_NOTES.md')
const ASSETS = path.join(ROOT, 'presentation_source', 'assets', 'screenshots')
const LOGO = path.join(ROOT, 'apps', 'web', 'static', 'brand', 'supplify-logo.png')
const SHOT = (name) => path.join(ASSETS, name)

const required = [
  LOGO,
  SHOT('restaurant-dashboard.png'),
  SHOT('supplier-command-center.png'),
  SHOT('supplier-fulfillment.png'),
  SHOT('public-supplier-catalog.png'),
]
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing asset: ${file}`)

const pptx = new pptxgen()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'Supplify'
pptx.company = 'Supplify'
pptx.subject = 'Stakeholder product and platform overview'
pptx.title = 'Supplify — The connected operating platform for F&B procurement & supply'
pptx.lang = 'en-US'
pptx.theme = { headFontFace: 'Segoe UI', bodyFontFace: 'Segoe UI', lang: 'en-US' }

const C = {
  ink: '1E0B3A', ink2: '3D2A57', purple: '5B21B6', violet: '7C3AED', lavender: 'A78BFA',
  pale: 'EDE9FE', pale2: 'F3F0FF', mint: '10B981', mintPale: 'DFF7ED', amber: 'F59E0B',
  amberPale: 'FFF3D6', coral: 'F9735B', coralPale: 'FDE8E4', blue: '2563EB', bluePale: 'E7EEFF',
  white: 'FFFFFF', off: 'F7F7FC', mist: 'EEEFF5', line: 'DEDCE8', muted: '6E687E', gray: '9A95A6',
}
const FONT = 'Segoe UI'
const notes = []

function text(slide, value, x, y, w, h, options = {}) {
  slide.addText(value, {
    x, y, w, h, fontFace: FONT, fontSize: 14, color: C.ink2,
    margin: 0.03, valign: 'mid', isTextBox: true, ...options,
  })
}
function softShadow(opacity = 0.12) {
  return { type: 'outer', color: '1E0B3A', blur: 10, offset: 3, opacity }
}
function box(slide, x, y, w, h, fill = C.white, line = C.line, radius = true, shadow = false) {
  const ww = Math.abs(w)
  const hh = Math.abs(h)
  const xx = w < 0 ? x + w : x
  const yy = h < 0 ? y + h : y
  slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
    x: xx, y: yy, w: ww, h: hh,
    fill: { color: fill },
    line: { color: line, width: line === fill ? 0 : 1 },
    ...(shadow ? { shadow: softShadow() } : {}),
  })
}
function dot(slide, x, y, d, fill) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } })
}
/** Draw a connector. Negative w/h are normalized — PowerPoint rejects negative a:ext. */
function line(slide, x, y, w, h = 0, color = C.line, width = 1.5, arrow = false) {
  const x2 = x + w
  const y2 = y + h
  const sx = Math.min(x, x2)
  const sy = Math.min(y, y2)
  const sw = Math.abs(w)
  const sh = Math.abs(h)
  // pptxgenjs draws from NW→SE of the box. flipH/flipV restore the intended direction.
  const flipH = x2 < x
  const flipV = y2 < y
  const lineOpts = { color, width }
  // With flipH/flipV, endArrow stays on the intended (x2,y2) endpoint.
  if (arrow) lineOpts.endArrowType = 'triangle'
  slide.addShape(pptx.ShapeType.line, {
    x: sx, y: sy, w: sw || 0.001, h: sh || 0.001,
    flipH, flipV,
    line: lineOpts,
  })
}
function pill(slide, value, x, y, w, fill = C.pale, color = C.purple) {
  box(slide, x, y, w, 0.34, fill, fill)
  text(slide, value, x + 0.05, y + 0.02, w - 0.1, 0.27, { fontSize: 8.2, bold: true, color, align: 'center', charSpacing: 0.5 })
}
function badge(slide, value, x, y, fill = C.violet, d = 0.48) {
  dot(slide, x, y, d, fill)
  text(slide, value, x, y, d, d, { fontSize: 9, bold: true, color: C.white, align: 'center' })
}
function header(slide, title, kicker, subtitle = '') {
  slide.background = { color: C.off }
  text(slide, kicker.toUpperCase(), 0.57, 0.28, 7.5, 0.22, { fontSize: 8.2, bold: true, color: C.violet, charSpacing: 1.8 })
  text(slide, title, 0.56, 0.52, 12.08, 0.6, { fontSize: 26.5, bold: true, color: C.ink, valign: 'top' })
  if (subtitle) text(slide, subtitle, 0.58, 1.14, 11.92, 0.36, { fontSize: 12, color: C.muted, valign: 'top' })
}
function footer(slide, page) {
  text(slide, 'SUPPLIFY  •  STAKEHOLDER OVERVIEW', 0.57, 7.12, 5.2, 0.18, { fontSize: 7.2, color: C.gray, charSpacing: 1 })
  text(slide, String(page).padStart(2, '0'), 12.72, 7.09, 0.28, 0.19, { fontSize: 8, bold: true, color: C.violet, align: 'right' })
}
function standard(title, kicker, subtitle, page) {
  const slide = pptx.addSlide()
  header(slide, title, kicker, subtitle)
  footer(slide, page)
  return slide
}
function shot(slide, name, x, y, w, h) {
  box(slide, x - 0.06, y - 0.06, w + 0.12, h + 0.12, C.white, C.white, true, true)
  slide.addImage({ path: SHOT(name), x, y, w, h })
  pill(slide, 'LIVE PRODUCT UI  •  SEEDED DEMO DATA', x + 0.16, y + h - 0.37, 2.75, C.ink, C.white)
}
function card(slide, x, y, w, h, title, body, accent = C.violet, number = '') {
  box(slide, x, y, w, h, C.white, C.mist, true, true)
  if (number) badge(slide, number, x + 0.22, y + 0.21, accent, 0.42)
  text(slide, title, x + (number ? 0.77 : 0.26), y + 0.18, w - (number ? 1.02 : 0.5), 0.36, { fontSize: 13, bold: true, color: C.ink })
  text(slide, body, x + 0.27, y + 0.68, w - 0.52, h - 0.83, { fontSize: 9.5, color: C.muted, valign: 'top', breakLine: true })
}
function addNotes(slide, data) {
  slide.addNotes(`EMPHASIZE: ${data.emphasize}\n\nNUANCE: ${data.nuance}\n\nTRANSITION: ${data.transition}`)
  notes.push(data)
}

// 01 — Cover
{
  const s = pptx.addSlide()
  s.background = { color: C.ink }
  dot(s, 8.1, -2.3, 7.8, C.violet)
  dot(s, 10.4, 4.45, 4.1, C.mint)
  slideFade(s, 8.1, -2.3, 7.8, 72)
  slideFade(s, 10.4, 4.45, 4.1, 70)
  s.addImage({ path: LOGO, x: 0.7, y: 0.48, w: 0.7, h: 0.7 })
  text(s, 'SUPPLIFY', 1.51, 0.57, 3.2, 0.37, { fontSize: 17, bold: true, color: C.white, charSpacing: 2.2 })
  pill(s, 'STAKEHOLDER OVERVIEW', 10.55, 0.58, 2.05, '382054', C.lavender)
  text(s, 'Stop running F&B supply\nacross chats, sheets, and guesswork.', 0.73, 1.45, 9.4, 1.35, { fontSize: 32, bold: true, color: C.white, valign: 'top', breakLine: true })
  text(s, 'Supplify is the connected operating platform for procurement and supply—one shared workflow from discovery and pricing through fulfillment, delivery, receiving, and financial control.', 0.76, 3.0, 8.3, 0.78, { fontSize: 14.2, color: 'DED6EA', valign: 'top' })
  ;['SOURCE', 'ORDER', 'FULFILL', 'DELIVER', 'RECEIVE', 'CONTROL'].forEach((v, i) => {
    const x = 0.77 + i * 1.31
    pill(s, v, x, 4.28, 1.1, i === 5 ? C.mint : '382054', i === 5 ? C.ink : C.white)
    if (i < 5) line(s, x + 1.11, 4.45, 0.17, 0, i === 4 ? C.mint : C.lavender, 1.1, true)
  })
  box(s, 0.77, 5.15, 7.6, 0.72, '2A1545', '2A1545', true)
  text(s, 'Built for restaurant teams and suppliers who need execution depth—not another catalog inbox.', 0.98, 5.32, 7.2, 0.38, { fontSize: 11.5, bold: true, color: C.white, valign: 'mid' })
  text(s, 'September 2026', 0.78, 6.66, 3.2, 0.23, { fontSize: 8.8, color: C.lavender, bold: true })
  text(s, 'Product-ready platform  •  Pilot-ready conversation', 7.4, 6.66, 5.1, 0.23, { fontSize: 8.8, color: C.mint, bold: true, align: 'right' })
  addNotes(s, {
    title: 'Stop running F&B supply across chats, sheets, and guesswork',
    emphasize: 'Open with the pain, then position Supplify as the shared operating layer—not only a marketplace.',
    nuance: 'This is a product and operating-model overview, not a claim of customer traction. UI screenshots use isolated seeded demo data.',
    transition: 'Start with the fragmented reality the platform is designed to replace.',
    sources: ['apps/web/static/brand/supplify-logo.png', 'PRODUCT_BUSINESS_LOGIC_AUDIT.md'],
  })
}

function slideFade(slide, x, y, d, transparency) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: C.ink, transparency }, line: { color: C.ink, transparency: 100 } })
}

// 02 — Problem
{
  const s = standard('Every order still dies in a group chat', 'The operating problem', 'Buying may start digitally—but price, stock, delivery, and payment truth scatter the moment the work begins.', 2)
  const rows = [
    ['01', 'Discovery', 'Supplier contacts, catalogs, and availability live in different places.'],
    ['02', 'Commercial terms', 'Prices, quotes, promotions, and minimums are hard to reconcile.'],
    ['03', 'Execution', 'Calls, WhatsApp, and spreadsheets become the real operating system.'],
    ['04', 'Reconciliation', 'Delivery, receiving, disputes, invoices, and payment records drift apart.'],
  ]
  rows.forEach((r, i) => {
    const y = 1.78 + i * 1.13
    badge(s, r[0], 0.7, y + 0.02, i < 2 ? C.violet : i === 2 ? C.amber : C.coral, 0.5)
    text(s, r[1], 1.4, y, 1.68, 0.3, { fontSize: 13.5, bold: true, color: C.ink })
    text(s, r[2], 3.05, y - 0.01, 4.72, 0.44, { fontSize: 10.8, color: C.muted, valign: 'top' })
    if (i < 3) line(s, 0.95, y + 0.53, 0, 0.59, C.line, 1.2)
  })
  box(s, 8.25, 1.72, 4.43, 4.56, C.ink, C.ink, true, true)
  text(s, 'THE REAL COST', 8.7, 2.13, 3.5, 0.27, { fontSize: 9, bold: true, color: C.lavender, charSpacing: 1.4 })
  text(s, 'Your team reconstructs yesterday instead of controlling tomorrow.', 8.7, 2.7, 3.48, 1.55, { fontSize: 20, bold: true, color: C.white, valign: 'top' })
  pill(s, 'ONE ORDER  •  MANY VERSIONS OF TRUTH', 8.7, 5.25, 3.34, C.violet, C.white)
  addNotes(s, {
    title: 'Every order still dies in a group chat',
    emphasize: 'The core problem is not lack of screens; it is the absence of one connected operational record across both sides of the transaction.',
    nuance: 'Avoid unsupported market-size or efficiency statistics. Keep the point grounded in workflow fragmentation.',
    transition: 'Supplify connects those stages into one shared flow.',
    sources: ['PRODUCT_BUSINESS_LOGIC_AUDIT.md — cross-domain business journeys'],
  })
}

// 03 — Platform
{
  const s = standard('One order. One timeline. One source of truth.', 'The platform', 'A marketplace at the front—with the operational depth to finish the job after checkout.', 3)
  const actors = [['RESTAURANT', 'Demand & control', C.purple], ['SUPPLIFY', 'Shared operating record', C.violet], ['SUPPLIER', 'Sell & execute', C.mint]]
  actors.forEach((a, i) => {
    const x = 0.72 + i * 3.94
    box(s, x, 1.72, 3.17, 1.08, a[2], a[2])
    text(s, a[0], x + 0.2, 1.93, 2.77, 0.3, { fontSize: 14, bold: true, color: C.white, align: 'center', charSpacing: 1 })
    text(s, a[1], x + 0.2, 2.34, 2.77, 0.2, { fontSize: 9, color: C.white, align: 'center' })
    if (i < 2) line(s, x + 3.25, 2.25, 0.54, 0, C.lavender, 2.4, true)
  })
  const steps = [['SOURCE', 'Discover • compare'], ['ORDER', 'Price • quote'], ['FULFILL', 'Reserve • pick'], ['DELIVER', 'Route • proof'], ['RECEIVE', 'Accept • dispute'], ['MANAGE', 'Stock • finance']]
  steps.forEach((a, i) => {
    const x = 0.7 + i * 2.07
    box(s, x, 3.66, 1.74, 1.55, i === 5 ? C.mintPale : i % 2 ? C.pale2 : C.white, i === 5 ? C.mint : C.line)
    badge(s, String(i + 1), x + 0.62, 3.39, i === 5 ? C.mint : C.violet, 0.5)
    text(s, a[0], x + 0.12, 4.03, 1.5, 0.28, { fontSize: 10.5, bold: true, color: C.ink, align: 'center', charSpacing: 0.6 })
    text(s, a[1], x + 0.14, 4.53, 1.46, 0.32, { fontSize: 8.2, color: C.muted, align: 'center' })
    if (i < 5) line(s, x + 1.76, 4.42, 0.25, 0, i === 4 ? C.mint : C.lavender, 1.2, true)
  })
  box(s, 2.18, 5.76, 8.98, 0.58, C.ink, C.ink, true, true)
  text(s, 'NO RE-KEYING.  NO PARALLEL TRUTH.  NO “WHAT ACTUALLY HAPPENED?”', 2.37, 5.89, 8.6, 0.27, { fontSize: 10, bold: true, color: C.white, align: 'center', charSpacing: 0.6 })
  addNotes(s, {
    title: 'One order. One timeline. One source of truth.',
    emphasize: 'The differentiated value is continuity: the same order moves through pricing, fulfillment, delivery, receiving, and finance without being re-created.',
    nuance: 'The six stages simplify a wider platform for business communication.',
    transition: 'That shared flow serves a multi-actor ecosystem, not one persona.',
    sources: ['apps/api/src/server.js', 'apps/web/src/App.tsx', 'PRODUCT_BUSINESS_LOGIC_AUDIT.md'],
  })
}

// 04 — Ecosystem
{
  const s = standard('One ecosystem, role-aware experiences', 'Who Supplify serves', 'Each actor sees the workflow they need; the platform keeps the shared commercial and operational context connected.', 4)
  const nodes = [
    [0.72, 1.82, 'R', 'Restaurant organization', 'Owners • buyers • finance • branch teams', C.purple],
    [0.72, 4.58, 'B', 'Restaurant branches', 'Delivery context • stock • receiving • staff', C.blue],
    [9.49, 1.82, 'S', 'Supplier organization', 'Sales • pricing • finance • operations', C.mint],
    [9.49, 4.58, 'W', 'Warehouses & drivers', 'Stock • fulfillment • routes • proof', C.amber],
  ]
  nodes.forEach((n) => {
    box(s, n[0], n[1], 3.12, 1.31, C.white, C.line)
    badge(s, n[2], n[0] + 0.25, n[1] + 0.3, n[5], 0.61)
    text(s, n[3], n[0] + 1.02, n[1] + 0.23, 1.88, 0.36, { fontSize: 12.5, bold: true, color: C.ink })
    text(s, n[4], n[0] + 1.02, n[1] + 0.67, 1.82, 0.42, { fontSize: 8.8, color: C.muted, valign: 'top' })
  })
  box(s, 4.5, 2.33, 4.31, 2.98, C.ink, C.ink)
  s.addImage({ path: LOGO, x: 5.99, y: 2.69, w: 1.32, h: 1.32 })
  text(s, 'SUPPLIFY', 5.15, 4.1, 3.0, 0.35, { fontSize: 17, bold: true, color: C.white, align: 'center', charSpacing: 2.2 })
  text(s, 'Identity • rules • events • records', 5.04, 4.65, 3.24, 0.23, { fontSize: 9, color: C.lavender, align: 'center' })
  ;[[3.88,2.45,0.5,C.lavender],[3.88,5.2,0.5,C.blue],[8.86,2.45,0.5,C.mint],[8.86,5.2,0.5,C.amber]].forEach((a)=>line(s,a[0],a[1],a[2],0,a[3],2,true))
  pill(s, 'OPTIONAL PUBLIC CHANNELS', 5.21, 5.86, 2.9, C.pale, C.purple)
  text(s, 'Consumer ordering • public supplier catalog', 4.68, 6.29, 3.96, 0.21, { fontSize: 8.7, color: C.muted, align: 'center' })
  addNotes(s, {
    title: 'One ecosystem, role-aware experiences',
    emphasize: 'Restaurant teams, supplier teams, warehouse operators, and drivers get purpose-built experiences tied to the same transaction.',
    nuance: 'Public restaurant ordering and supplier public catalog are optional channels around the core B2B workflow.',
    transition: 'First, see the restaurant experience as a control layer.',
    sources: ['apps/web/src/App.tsx', 'C:/myProjects/supplify-mobile/src', 'C:/myProjects/supplify-mobile-ios/src'],
  })
}

// 05 — Restaurant
{
  const s = standard('Give restaurant teams control—not another shopping cart', 'Restaurant experience', 'Source, buy, receive, and manage with branch-aware visibility and a shared transaction history.', 5)
  shot(s, 'restaurant-dashboard.png', 5.78, 1.66, 6.67, 4.17)
  const a = [['SOURCE', 'Suppliers, catalogs, deals, and RFQs'], ['PURCHASE', 'Contract pricing, quotes, cart, and quick lists'], ['TRACK', 'Order status, delivery progress, and exceptions'], ['RECEIVE', 'Accepted quantities, discrepancies, and disputes'], ['CONTROL', 'Inventory, invoices, costs, staff, and reporting']]
  a.forEach((r, i) => {
    const y = 1.72 + i * 0.87
    pill(s, r[0], 0.7, y, 1.15, i === 4 ? C.mintPale : C.pale, i === 4 ? C.mint : C.purple)
    text(s, r[1], 2.06, y, 3.35, 0.38, { fontSize: 10.3, color: C.ink2, valign: 'top' })
  })
  box(s, 0.71, 6.05, 11.74, 0.53, C.pale2, C.pale2, true)
  text(s, 'WHY IT WINS', 0.96, 6.17, 1.1, 0.23, { fontSize: 8.5, bold: true, color: C.violet, charSpacing: 0.8 })
  text(s, 'Purchasing, receiving, stock, and payables stay connected—so the branch never rebuilds the story after delivery.', 2.2, 6.13, 9.8, 0.29, { fontSize: 10.2, bold: true, color: C.ink })
  addNotes(s, {
    title: 'Give restaurant teams control—not another shopping cart',
    emphasize: 'Supplify starts with easier sourcing and ordering but extends into the disciplines that determine margin and consistency.',
    nuance: 'Dashboard values are seeded demo data. Full centralized purchasing across every branch remains a future capability.',
    transition: 'The supplier receives the same order as an executable operational commitment.',
    sources: ['apps/web restaurant routes and modules', 'presentation_source/assets/screenshots/restaurant-dashboard.png'],
  })
}

// 06 — Supplier
{
  const s = standard('Turn every order into an executable operating plan', 'Supplier experience', 'Sell with customer-specific terms, then coordinate warehouse, delivery, receivables, and growth.', 6)
  shot(s, 'supplier-command-center.png', 0.73, 1.66, 6.56, 4.1)
  const a = [['SELL', 'Catalogs, customer pricing, quotes, and promotions'], ['FULFILL', 'Acknowledge, reserve, pick, pack, and assign'], ['DELIVER', 'Routes, drivers, live status, and proof'], ['MANAGE', 'Inventory, disputes, invoices, and receivables'], ['GROW', 'Customer acquisition and operational intelligence']]
  a.forEach((r, i) => {
    const y = 1.74 + i * 0.87
    pill(s, r[0], 7.72, y, 1.15, i === 4 ? C.mintPale : C.pale, i === 4 ? C.mint : C.purple)
    text(s, r[1], 9.06, y, 3.46, 0.4, { fontSize: 10.2, color: C.ink2, valign: 'top' })
  })
  box(s, 0.73, 6.05, 11.8, 0.52, C.ink, C.ink, true, true)
  text(s, 'INCOMING ORDER  →  OPERATIONAL QUEUE  →  PROOF  →  RECEIVABLE', 0.97, 6.16, 11.32, 0.28, { fontSize: 10.5, bold: true, color: C.white, align: 'center', charSpacing: 0.8 })
  addNotes(s, {
    title: 'Turn every order into an executable operating plan',
    emphasize: 'Supplify gives suppliers an operational command center—not merely a seller listing or order inbox.',
    nuance: 'Inventory remains controlled by the operating supplier tenant and warehouse.',
    transition: 'The common thread is one order lifecycle with clear state and ownership.',
    sources: ['apps/api supplier routes and services', 'presentation_source/assets/screenshots/supplier-command-center.png'],
  })
}

// 07 — Lifecycle
{
  const s = standard('One order lifecycle—five moments of control', 'How the workflow fits together', 'Commercial intent, physical execution, acceptance, and financial closure remain connected—but distinct.', 7)
  const stages = [['1', 'SOURCE', 'Catalog\nRelationships\nRFQ'], ['2', 'COMMIT', 'Price resolve\nQuote lock\nCheckout'], ['3', 'FULFILL', 'Reserve\nPick & pack\nAssign'], ['4', 'DELIVER', 'Route\nDriver status\nProof'], ['5', 'RECONCILE', 'Receive\nDispute\nInvoice & pay']]
  stages.forEach((a, i) => {
    const x = 0.66 + i * 2.52
    const accent = i === 4 ? C.mint : i === 3 ? C.amber : C.violet
    box(s, x, 2.05, 2.12, 3.38, C.white, C.line)
    badge(s, a[0], x + 0.72, 1.72, accent, 0.68)
    text(s, a[1], x + 0.18, 2.47, 1.76, 0.34, { fontSize: 12, bold: true, color: C.ink, align: 'center', charSpacing: 0.7 })
    text(s, a[2], x + 0.25, 3.12, 1.62, 1.25, { fontSize: 10.3, color: C.muted, align: 'center', valign: 'top', breakLine: true })
    if (i < 4) line(s, x + 2.15, 3.65, 0.29, 0, i === 3 ? C.mint : C.lavender, 2, true)
  })
  box(s, 1.31, 5.94, 10.7, 0.58, C.coralPale, C.coralPale, true)
  text(s, 'DELIVERED  ≠  RECEIVED  ≠  INVOICED  ≠  PAID', 1.55, 6.06, 5.7, 0.29, { fontSize: 11, bold: true, color: C.coral, align: 'center', charSpacing: 0.4 })
  text(s, 'Clarity buyers and suppliers can trust.', 7.45, 6.06, 4.15, 0.29, { fontSize: 10, bold: true, color: C.ink2, align: 'center' })
  addNotes(s, {
    title: 'One order lifecycle—five moments of control',
    emphasize: 'Physical delivery, receiving acceptance, invoicing, and payment are separate milestones—not one vague “complete” status.',
    nuance: 'Invoices are grounded in accepted receiving quantities. Server-side state transitions and snapshots preserve the record.',
    transition: 'This lifecycle stays coherent across branches and warehouses.',
    sources: ['PRODUCT_BUSINESS_LOGIC_AUDIT.md — ordering, fulfillment, receiving, finance'],
  })
}

// 08 — Multi-branch
{
  const s = standard('Built for organizations—not isolated locations', 'Multi-branch operating model', 'Commercial visibility rolls up while execution stays attached to the branch, tenant, and warehouse that own it.', 8)
  text(s, 'RESTAURANT SIDE', 0.74, 1.62, 3.2, 0.24, { fontSize: 8.5, bold: true, color: C.purple, charSpacing: 1.4 })
  box(s, 0.74, 2.03, 3.1, 0.83, C.purple, C.purple)
  text(s, 'Restaurant organization', 1.0, 2.24, 2.58, 0.3, { fontSize: 13.5, bold: true, color: C.white, align: 'center' })
  ;['Branch A', 'Branch B', 'Branch C'].forEach((v, i) => {
    const x = 0.74 + i * 1.16
    box(s, x, 3.52, 0.99, 0.7, C.white, C.blue)
    text(s, v, x + 0.07, 3.71, 0.85, 0.25, { fontSize: 9, bold: true, color: C.blue, align: 'center' })
    line(s, 2.29, 2.86, x + 0.49 - 2.29, 0.66, C.blue, 1.1)
  })
  text(s, 'Central visibility\nBranch delivery context\nBranch stock & receiving', 0.86, 4.73, 2.85, 0.98, { fontSize: 10, color: C.muted, align: 'center', valign: 'top', breakLine: true })
  text(s, 'SUPPLIER SIDE', 9.42, 1.62, 3.18, 0.24, { fontSize: 8.5, bold: true, color: C.mint, charSpacing: 1.4, align: 'right' })
  box(s, 9.5, 2.03, 3.1, 0.83, C.mint, C.mint)
  text(s, 'Supplier organization', 9.76, 2.24, 2.58, 0.3, { fontSize: 13.5, bold: true, color: C.white, align: 'center' })
  ;['OpCo A', 'OpCo B'].forEach((v, i) => {
    const x = 9.51 + i * 1.72
    box(s, x, 3.44, 1.43, 0.7, C.white, C.mint)
    text(s, v, x + 0.08, 3.63, 1.27, 0.25, { fontSize: 9, bold: true, color: C.mint, align: 'center' })
    line(s, 11.05, 2.86, x + 0.72 - 11.05, 0.58, C.mint, 1.1)
  })
  ;['WH 1', 'WH 2', 'WH 3'].forEach((v, i) => {
    const x = 8.91 + i * 1.27
    box(s, x, 4.82, 1.04, 0.68, C.amberPale, C.amber)
    text(s, v, x + 0.08, 5.0, 0.88, 0.25, { fontSize: 9, bold: true, color: C.amber, align: 'center' })
  })
  text(s, 'Customer sees the organization.\nStock and fulfillment retain explicit ownership.', 8.92, 5.82, 3.66, 0.55, { fontSize: 9.3, color: C.muted, align: 'center', valign: 'top' })
  box(s, 4.51, 2.44, 4.29, 3.18, C.ink, C.ink)
  text(s, 'THE RULE', 5.04, 2.83, 3.23, 0.25, { fontSize: 8.5, bold: true, color: C.lavender, align: 'center', charSpacing: 1.4 })
  text(s, 'Visibility rolls up.\nOperational ownership stays explicit.', 4.96, 3.35, 3.39, 1.08, { fontSize: 19, bold: true, color: C.white, align: 'center', valign: 'mid', breakLine: true })
  pill(s, 'NO ARBITRARY CROSS-TENANT FULFILLMENT', 4.96, 4.9, 3.39, C.violet, C.white)
  addNotes(s, {
    title: 'Built for organizations—not isolated locations',
    emphasize: 'Supplify separates the customer relationship from the tenant and warehouse that operationally own inventory and fulfillment.',
    nuance: 'A new basket resolves to one compatible supplier tenant and warehouse. Full central-purchasing orchestration is not complete.',
    transition: 'The same discipline applies to price resolution.',
    sources: ['PRODUCT_BUSINESS_LOGIC_AUDIT.md — organization model and cart routing'],
  })
}

// 09 — Pricing
{
  const s = standard('Pricing follows the relationship—then becomes immutable', 'Commercial control', 'Applicable terms are resolved at checkout and the result is snapshotted onto the order.', 9)
  const layers = [
    ['DEFAULT CATALOG PRICE', 'Supplier standard sell price', 5.05, C.mist, C.ink2],
    ['ACTIVE CONTRACT / CUSTOMER PRICE', 'Date- and quantity-valid relationship terms', 6.15, C.pale, C.purple],
    ['ACCEPTED QUOTE LOCK', 'Committed quote overrides the contract for that line', 7.25, 'DED0FA', C.purple],
    ['ELIGIBLE PROMOTION', 'Applied after the base price, subject to rules', 8.35, C.mintPale, C.mint],
    ['ORDER SNAPSHOT', 'Price, quantity, and context preserved for audit', 9.42, C.ink, C.white],
  ]
  layers.forEach((a, i) => {
    const y = 1.68 + i * 0.88
    const x = 0.74 + (9.42 - a[2]) / 2
    box(s, x, y, a[2], 0.67, a[3], a[3])
    text(s, a[0], x + 0.22, y + 0.12, a[2] * 0.52, 0.25, { fontSize: 9.5, bold: true, color: a[4] })
    text(s, a[1], x + a[2] * 0.49, y + 0.11, a[2] * 0.48 - 0.18, 0.29, { fontSize: 8.2, color: a[4], align: 'right' })
  })
  box(s, 10.72, 1.69, 1.9, 4.2, C.white, C.line)
  text(s, 'SERVER-SIDE\nGUARDRAILS', 10.98, 2.07, 1.38, 0.53, { fontSize: 9.8, bold: true, color: C.violet, align: 'center', breakLine: true })
  ;['Re-resolve at checkout', 'MOQ & order multiple', 'Scope & expiry checks', 'No client price trust'].forEach((v, i) => {
    dot(s, 10.99, 2.99 + i * 0.62, 0.18, i === 3 ? C.mint : C.violet)
    text(s, v, 11.31, 2.93 + i * 0.62, 1.03, 0.31, { fontSize: 8.1, color: C.ink2, valign: 'top' })
  })
  addNotes(s, {
    title: 'Pricing follows the relationship—then becomes immutable',
    emphasize: 'Supplify supports the real B2B hierarchy: catalog, relationship pricing, committed quotes, and promotions.',
    nuance: 'Checkout revalidates on the server. The order line becomes a historical snapshot, not a live reference.',
    transition: 'Once committed, the order becomes a controlled fulfillment job.',
    sources: ['PRODUCT_BUSINESS_LOGIC_AUDIT.md — pricing hierarchy', 'apps/api pricing, quote, promotion, and checkout services'],
  })
}

// 10 — Fulfillment
{
  const s = standard('The marketplace continues into the warehouse and onto the road', 'Fulfillment & delivery', 'The order remains connected while each role works from its own queue and permissions.', 10)
  shot(s, 'supplier-fulfillment.png', 0.74, 1.62, 6.72, 4.2)
  const a = [['01', 'ORDER', 'Committed demand'], ['02', 'WAREHOUSE', 'Stock owner'], ['03', 'PICK / PACK', 'Executable queue'], ['04', 'ROUTE', 'Stops & sequence'], ['05', 'DRIVER', 'Mobile status'], ['06', 'POD', 'Evidence captured'], ['07', 'RECEIVING', 'Accepted truth']]
  a.forEach((r, i) => {
    const y = 1.63 + i * 0.69
    const color = i < 3 ? C.violet : i < 6 ? C.amber : C.mint
    badge(s, r[0], 7.86, y, color, 0.4)
    text(s, r[1], 8.44, y - 0.01, 1.6, 0.25, { fontSize: 10, bold: true, color: C.ink })
    text(s, r[2], 10.04, y - 0.01, 2.2, 0.25, { fontSize: 8.8, color: C.muted })
    if (i < 6) line(s, 8.06, y + 0.4, 0, 0.3, C.line, 1.2)
  })
  box(s, 0.74, 6.07, 11.63, 0.52, C.amberPale, C.amberPale)
  text(s, 'ROUTING BOUNDARY', 1.01, 6.18, 1.31, 0.23, { fontSize: 8.5, bold: true, color: C.amber })
  text(s, 'Each new basket is fulfilled by one compatible supplier tenant and one warehouse; it is not silently split across operators.', 2.42, 6.14, 9.42, 0.3, { fontSize: 9.4, color: C.ink2 })
  addNotes(s, {
    title: 'The marketplace continues into the warehouse and onto the road',
    emphasize: 'Warehouse ownership, fulfillment queues, driver workflow, and proof are part of the product.',
    nuance: 'New baskets do not arbitrarily split across tenants or warehouses; legacy assignments can still be read.',
    transition: 'Receiving turns physical delivery into accepted operational truth.',
    sources: ['presentation_source/assets/screenshots/supplier-fulfillment.png', 'PRODUCT_BUSINESS_LOGIC_AUDIT.md'],
  })
}

// 11 — Beyond ordering
{
  const s = standard('The order becomes an operating data flywheel', 'Beyond procurement', 'Accepted supply activity feeds the modules that help restaurants control stock, cost, people, and service.', 11)
  dot(s, 5.25, 2.16, 2.83, C.ink)
  s.addImage({ path: LOGO, x: 6.03, y: 2.66, w: 1.28, h: 1.28 })
  text(s, 'ACCEPTED\nORDER TRUTH', 5.67, 4.03, 2.0, 0.53, { fontSize: 10, bold: true, color: C.white, align: 'center', breakLine: true })
  const mods = [
    [0.72,1.71,'I','Inventory','On-hand • lots • expiry • waste',C.blue], [0.72,3.4,'$','Finance','Invoices • payables • credits • aging',C.mint], [0.72,5.09,'C','Recipes & cost','Ingredients • yield • cost impact',C.amber],
    [9.61,1.71,'T','Staff','Roles • schedules • labor operations',C.purple], [9.61,3.4,'G','Guest operations','Reservations • waitlist • ordering',C.coral], [9.61,5.09,'R','Reports & relationships','Performance • suppliers • disputes',C.violet],
  ]
  mods.forEach((m) => {
    box(s, m[0], m[1], 3.0, 1.1, C.white, C.line)
    badge(s, m[2], m[0] + 0.22, m[1] + 0.28, m[5], 0.54)
    text(s, m[3], m[0] + 0.9, m[1] + 0.19, 1.86, 0.3, { fontSize: 11.5, bold: true, color: C.ink })
    text(s, m[4], m[0] + 0.9, m[1] + 0.61, 1.82, 0.26, { fontSize: 8.4, color: C.muted })
  })
  ;[[3.75,2.26,1.25],[3.75,3.95,1.25],[3.75,5.64,1.47],[8.14,2.26,1.3],[8.14,3.95,1.3],[8.14,5.64,1.3]].forEach((a,i)=>line(s,a[0],a[1],a[2],0,i>2?C.lavender:C.line,1.2,true))
  text(s, 'Implemented as product modules; several cross-module automation loops remain partial.', 0.74, 6.57, 11.7, 0.19, { fontSize: 7.5, color: C.gray, italic: true })
  addNotes(s, {
    title: 'The order becomes an operating data flywheel',
    emphasize: 'Strategic value compounds when accepted order data improves inventory, payables, recipe costs, staffing context, and reporting.',
    nuance: 'These modules exist, but not every cross-module loop is fully automated.',
    transition: 'Selected offers can also extend beyond the authenticated B2B network.',
    sources: ['apps/web/src/App.tsx — restaurant modules', 'apps/api/src/server.js'],
  })
}

// 12 — Public channels
{
  const s = standard('A B2B core—with optional public demand channels', 'Channel expansion', 'Selected catalog and ordering experiences can be exposed publicly without replacing the operating system behind them.', 12)
  box(s, 0.73, 1.67, 4.16, 4.95, C.ink, C.ink)
  pill(s, 'CORE', 1.04, 1.99, 0.85, C.violet, C.white)
  text(s, 'Authenticated B2B network', 1.04, 2.49, 3.4, 0.4, { fontSize: 17.5, bold: true, color: C.white })
  const core = [['Restaurant procurement', 'Relationships and negotiated terms'], ['Supplier operations', 'Catalog, fulfillment, delivery, receivables'], ['Shared controls', 'Identity, permissions, audit, notifications']]
  core.forEach((a, i) => {
    badge(s, String(i + 1), 1.04, 3.2 + i * 0.9, C.mint, 0.4)
    text(s, a[0], 1.58, 3.15 + i * 0.9, 2.5, 0.25, { fontSize: 10, bold: true, color: C.white })
    text(s, a[1], 1.58, 3.48 + i * 0.9, 2.65, 0.29, { fontSize: 8.4, color: 'CDC4D8', valign: 'top' })
  })
  shot(s, 'public-supplier-catalog.png', 5.23, 1.69, 7.12, 4.45)
  pill(s, 'ADDITIONAL CHANNELS', 5.45, 6.27, 1.85, C.pale, C.purple)
  text(s, 'Public supplier catalog & ordering', 7.52, 6.27, 2.28, 0.31, { fontSize: 9.2, bold: true, color: C.ink })
  text(s, 'Restaurant consumer ordering', 10.05, 6.27, 2.14, 0.31, { fontSize: 9.2, bold: true, color: C.ink })
  addNotes(s, {
    title: 'A B2B core—with optional public demand channels',
    emphasize: 'Public channels widen demand capture while existing operational infrastructure supports downstream handling.',
    nuance: 'Restaurant consumer ordering is a separate B2C hospitality loop and remains secondary to the B2B story.',
    transition: 'The intelligence layer explains and prioritizes without uncontrolled action.',
    sources: ['apps/api/db/migrations/0223_public_supplier_sales_channel.sql', 'presentation_source/assets/screenshots/public-supplier-catalog.png'],
  })
}

// 13 — Intelligence
{
  const s = standard('Intelligence that explains the operation before it automates it', 'Decision support', 'Deterministic services calculate; the assistant reads and explains within the user’s permissions and plan.', 13)
  box(s, 0.73, 1.67, 6.02, 4.93, C.white, C.line)
  pill(s, 'WHAT IT DOES TODAY', 1.04, 1.98, 1.66, C.mintPale, C.mint)
  const does = [['Read-only assistant', 'Answers from live, tenant-scoped operational data.'], ['Operational intelligence', 'Demand, expiry, waste, stockout, customer, and warehouse signals.'], ['Reorder assistance', 'Deterministic baseline; AI explanation when entitled.'], ['Human review', 'Recommendations remain reviewable before action.']]
  does.forEach((a, i) => {
    const y = 2.64 + i * 0.9
    badge(s, String(i + 1), 1.05, y, i === 3 ? C.mint : C.violet, 0.45)
    text(s, a[0], 1.68, y - 0.02, 2.06, 0.26, { fontSize: 10.6, bold: true, color: C.ink })
    text(s, a[1], 3.68, y - 0.02, 2.58, 0.4, { fontSize: 8.9, color: C.muted, valign: 'top' })
  })
  box(s, 7.05, 1.67, 5.54, 4.93, C.ink, C.ink)
  pill(s, 'GUARDRAILS', 7.39, 1.98, 1.14, C.violet, C.white)
  text(s, 'The assistant does not…', 7.4, 2.52, 4.5, 0.33, { fontSize: 15.5, bold: true, color: C.white })
  ;['Place or approve an order', 'Change stock or pricing', 'Assign a driver or route', 'Bypass tenant permissions', 'Present heuristic fallback as AI'].forEach((v, i) => {
    badge(s, '×', 7.42, 3.12 + i * 0.56, C.coral, 0.24)
    text(s, v, 7.82, 3.08 + i * 0.56, 3.95, 0.29, { fontSize: 10, color: C.white })
  })
  text(s, 'Availability is gated by tenant type, plan, feature flags, permissions, provider configuration, and quota.', 0.74, 6.56, 11.72, 0.19, { fontSize: 7.5, color: C.gray, italic: true })
  addNotes(s, {
    title: 'Intelligence that explains the operation before it automates it',
    emphasize: 'Current intelligence is deliberately safe: deterministic calculations and a permission-aware, read-only assistant.',
    nuance: 'It cannot place orders, mutate stock, set prices, or assign drivers. Action-taking AI is roadmap.',
    transition: 'The event system gets the right signals to the right people and channels.',
    sources: ['HANDOVER_INTELLIGENCE.md', 'docs/product/four-plan-pricing-model.md'],
  })
}

// 14 — Notifications
{
  const s = standard('Events become coordinated action—not more noise', 'Notification fabric', 'A single event can fan out by actor, preference, feature entitlement, and channel configuration.', 14)
  const events = [['ORDER', 'Acknowledged'], ['FULFILLMENT', 'Ready / delayed'], ['DELIVERY', 'Arriving / proof'], ['RECEIVING', 'Accepted / disputed'], ['FINANCE', 'Invoice / overdue']]
  events.forEach((a, i) => {
    const y = 1.72 + i * 0.88
    pill(s, a[0], 0.74, y, 1.31, i === 4 ? C.mintPale : C.pale, i === 4 ? C.mint : C.purple)
    text(s, a[1], 2.2, y + 0.02, 1.35, 0.27, { fontSize: 9.6, bold: true, color: C.ink })
    line(s, 3.45, y + 0.17, 0.72, 0, C.lavender, 1.5, true)
  })
  box(s, 4.38, 2.18, 3.18, 3.53, C.ink, C.ink)
  s.addImage({ path: LOGO, x: 5.5, y: 2.53, w: 0.94, h: 0.94 })
  text(s, 'EVENT ROUTER', 4.81, 3.66, 2.32, 0.31, { fontSize: 14.5, bold: true, color: C.white, align: 'center', charSpacing: 0.9 })
  ;['ACTOR', 'PREFERENCE', 'FEATURE', 'CHANNEL'].forEach((v, i) => pill(s, v, 4.72 + (i % 2) * 1.31, 4.28 + Math.floor(i / 2) * 0.49, 1.16, C.violet, C.white))
  line(s, 7.62, 3.98, 0.43, 0, C.mint, 1.8, true)
  const ch = [['IN-APP', 'Default record', C.purple], ['REALTIME', 'Live updates', C.blue], ['EMAIL', 'When configured', C.amber], ['WHATSAPP', 'When configured', C.mint], ['PUSH', 'Web & native', C.coral], ['WEBHOOK', 'Signed event', C.violet]]
  ch.forEach((a, i) => {
    const x = 8.16 + (i % 2) * 2.23
    const y = 1.7 + Math.floor(i / 2) * 1.54
    box(s, x, y, 1.93, 1.15, C.white, C.line)
    dot(s, x + 0.19, y + 0.24, 0.31, a[2])
    text(s, a[0], x + 0.61, y + 0.18, 1.12, 0.25, { fontSize: 9, bold: true, color: C.ink })
    text(s, a[1], x + 0.19, y + 0.68, 1.5, 0.26, { fontSize: 7.8, color: C.muted })
  })
  text(s, 'Some delivery milestones intentionally remain in-app only.', 8.18, 6.33, 4.13, 0.2, { fontSize: 7.8, color: C.gray, align: 'center' })
  addNotes(s, {
    title: 'Events become coordinated action—not more noise',
    emphasize: 'Recipients, preferences, plan features, and configured channels all shape operational communication.',
    nuance: 'In-app and realtime are core. External channels depend on environment and configuration.',
    transition: 'This workflow depth depends on a deliberate trust layer.',
    sources: ['PRODUCT_BUSINESS_LOGIC_AUDIT.md — notifications', 'apps/api notification services'],
  })
}

// 15 — Security
{
  const s = standard('Trust is designed into the operating layer', 'Security & governance', 'Controls protect tenant boundaries, privileged actions, documents, identities, and the historical record.', 15)
  const a = [
    ['01','Tenant isolation','Business data is scoped to the organization and server-resolved context.',C.violet],
    ['02','Roles & permissions','RBAC, feature entitlements, and plan limits shape every experience.',C.violet],
    ['03','Identity','Keycloak-backed sessions and guarded role-aware routes.',C.blue],
    ['04','Private files','Signed access, validation, quarantine, and malware scanning when configured.',C.amber],
    ['05','Auditability','Commercial, admin, security, and status actions retain history.',C.violet],
    ['06','Admin safeguards','Time-limited impersonation blocks sensitive mutations.',C.mint],
  ]
  a.forEach((r, i) => card(s, 0.7 + (i % 3) * 4.17, 1.78 + Math.floor(i / 3) * 2.3, 3.72, 1.84, r[1], r[2], r[3], r[0]))
  box(s, 2.08, 6.43, 9.15, 0.31, C.pale, C.pale)
  text(s, 'Application controls, platform configuration, and deployment operations work together.', 2.27, 6.48, 8.77, 0.2, { fontSize: 8, color: C.purple, bold: true, align: 'center' })
  addNotes(s, {
    title: 'Trust is designed into the operating layer',
    emphasize: 'Trust layers tenant context, permissions, private asset access, validation, audit, rate limits, and privileged-action safeguards.',
    nuance: 'Production security also depends on deployment configuration, credentials, monitoring, and operations.',
    transition: 'The same model is delivered through web, mobile, and public channels.',
    sources: ['apps/api/src/middlewares', 'apps/api storage, audit, impersonation, and rate-limit services', 'docs/architecture/rbac-overview.md'],
  })
}

// 16 — Architecture
{
  const s = standard('One platform, multiple role-aware surfaces', 'Platform architecture', 'Channel-specific experiences sit on shared domain services, controls, and infrastructure.', 16)
  const surfaces = [['WEB ERP', 'Restaurant • supplier • admin', C.purple], ['MOBILE', 'Restaurant • supplier • driver', C.blue], ['PUBLIC', 'Supplier catalog • consumer ordering', C.mint]]
  surfaces.forEach((a, i) => {
    const x = 0.74 + i * 4.18
    box(s, x, 1.65, 3.72, 1.0, a[2], a[2])
    text(s, a[0], x + 0.2, 1.87, 3.32, 0.28, { fontSize: 14, bold: true, color: C.white, align: 'center', charSpacing: 1 })
    text(s, a[1], x + 0.2, 2.24, 3.32, 0.2, { fontSize: 8.4, color: C.white, align: 'center' })
    line(s, x + 1.86, 2.65, 0, 0.48, C.line, 1.4)
  })
  box(s, 0.74, 3.14, 11.86, 2.11, C.white, C.line)
  text(s, 'SHARED PLATFORM DOMAINS', 1.03, 3.43, 11.28, 0.25, { fontSize: 9, bold: true, color: C.violet, align: 'center', charSpacing: 1.3 })
  const domains = ['IDENTITY & TENANCY','CATALOG & PRICING','ORDERS & QUOTES','INVENTORY & RECEIVING','FULFILLMENT & DELIVERY','FINANCE & DISPUTES','NOTIFICATIONS & AUDIT','INTELLIGENCE & REPORTING']
  domains.forEach((v, i) => pill(s, v, 1.06 + (i % 4) * 2.84, 3.93 + Math.floor(i / 4) * 0.65, 2.56, i > 3 ? C.mintPale : C.pale, i > 3 ? C.mint : C.purple))
  box(s, 1.65, 5.87, 10.0, 0.65, C.ink, C.ink)
  text(s, 'PostgreSQL  •  Redis  •  object storage  •  Keycloak  •  realtime & integrations', 1.92, 6.04, 9.46, 0.27, { fontSize: 9.8, bold: true, color: C.white, align: 'center' })
  addNotes(s, {
    title: 'One platform, multiple role-aware surfaces',
    emphasize: 'Web, Android, and iOS use the same domain model while giving each role an appropriate experience.',
    nuance: 'Android and iOS source coverage is structurally aligned. Deployment services remain configuration-dependent.',
    transition: 'This architecture enables workflow depth beyond a thin catalog marketplace.',
    sources: ['apps/api/src/server.js', 'apps/web/src/App.tsx', 'C:/myProjects/supplify-mobile/src', 'C:/myProjects/supplify-mobile-ios/src', 'docker-compose.yml'],
  })
}

// 17 — Differentiation
{
  const s = standard('Where others stop at “order placed,” Supplify keeps going', 'Why Supplify wins', 'A marketplace helps two parties meet. An operating platform helps them execute, reconcile, and improve together.', 17)
  box(s, 0.74, 1.66, 4.23, 4.98, C.white, C.mist, true, true)
  pill(s, 'TYPICAL MARKETPLACE', 1.07, 1.98, 1.84, C.mist, C.ink2)
  ;[['DISCOVER','Find a supplier'],['BROWSE','See a catalog'],['ORDER','Submit demand']].forEach((a, i) => {
    const y = 2.75 + i * 1.05
    badge(s, String(i + 1), 1.08, y, C.gray, 0.45)
    text(s, a[0], 1.72, y - 0.02, 1.14, 0.25, { fontSize: 9.8, bold: true, color: C.ink2 })
    text(s, a[1], 2.86, y - 0.02, 1.52, 0.25, { fontSize: 8.9, color: C.muted })
    if (i < 2) line(s, 1.31, y + 0.45, 0, 0.61, C.line, 1.2)
  })
  text(s, 'VALUE STOPS AT THE HANDOFF', 1.04, 5.95, 3.63, 0.27, { fontSize: 8.8, bold: true, color: C.gray, align: 'center', charSpacing: 0.8 })
  box(s, 5.27, 1.66, 7.32, 4.98, C.ink, C.ink, true, true)
  pill(s, 'SUPPLIFY', 5.66, 1.98, 1.04, C.violet, C.white)
  const deep = [['SOURCE',C.violet],['PRICE',C.violet],['ORDER',C.violet],['FULFILL',C.amber],['DELIVER',C.amber],['RECEIVE',C.mint],['RECONCILE',C.mint],['LEARN',C.blue]]
  deep.forEach((a, i) => {
    const x = 5.66 + (i % 4) * 1.61
    const y = 2.84 + Math.floor(i / 4) * 1.38
    badge(s, String(i + 1), x + 0.4, y, a[1], 0.58)
    text(s, a[0], x + 0.03, y + 0.71, 1.32, 0.25, { fontSize: 8.8, bold: true, color: C.white, align: 'center' })
    if (i % 4 < 3) line(s, x + 1.02, y + 0.29, 0.3, 0, i > 3 ? C.mint : C.lavender, 1.2, true)
  })
  text(s, 'VALUE COMPOUNDS AFTER THE ORDER', 5.66, 5.86, 6.52, 0.31, { fontSize: 10, bold: true, color: C.mint, align: 'center', charSpacing: 0.9 })
  addNotes(s, {
    title: 'Where others stop at “order placed,” Supplify keeps going',
    emphasize: 'Defensibility comes from connecting the operational steps after discovery and checkout—where complexity and data value accumulate.',
    nuance: 'This is a category comparison, not a named competitor benchmark.',
    transition: 'The commercial model maps that depth to each tenant’s operating complexity.',
    sources: ['PRODUCT_BUSINESS_LOGIC_AUDIT.md', 'docs/product/four-plan-pricing-model.md'],
  })
}

// 18 — Business model
{
  const s = standard('Subscriptions scale with operating complexity', 'Commercial model', 'A 30-day trial leads into tenant-specific plans. Prices shown are the current configured public catalog.', 18)
  pill(s, 'RESTAURANTS', 0.72, 1.61, 1.28, C.pale, C.purple)
  const rp = [['Growth','$49','1 active branch','Core purchasing & operations'],['Intelligence','$149','3 active branches','Operational intelligence'],['Scale','$349','Multi-branch','Advanced controls + assistant']]
  rp.forEach((a, i) => plan(s, 0.72 + i * 2.44, 2.02, 2.16, a, i === 2 ? C.mint : C.violet, i === 2))
  pill(s, 'SUPPLIERS', 8.13, 1.61, 1.18, C.mintPale, C.mint)
  const sp = [['Growth','$149','50 active customer locations / month','Core sales & operations'],['Scale','$349','200 active customer locations / month','Multi-warehouse + intelligence']]
  sp.forEach((a, i) => plan(s, 8.13 + i * 2.31, 2.02, 2.05, a, i === 1 ? C.mint : C.violet, i === 1))
  box(s, 0.72, 5.84, 11.72, 0.7, C.ink, C.ink)
  text(s, 'ANNUAL', 0.98, 6.02, 0.72, 0.23, { fontSize: 8.5, bold: true, color: C.lavender })
  text(s, '10× monthly price', 1.73, 6.0, 1.58, 0.27, { fontSize: 9.2, bold: true, color: C.white })
  text(s, 'SCALE ADD-ONS', 3.64, 6.02, 1.08, 0.23, { fontSize: 8.5, bold: true, color: C.mint })
  text(s, 'Supplier location, branch & warehouse capacity', 4.77, 6.0, 3.02, 0.27, { fontSize: 8.8, color: C.white })
  text(s, 'BILLING', 8.08, 6.02, 0.65, 0.23, { fontSize: 8.5, bold: true, color: C.amber })
  text(s, 'Manual/stub capable; live recurring PSP integration remains external work', 8.8, 5.96, 3.18, 0.37, { fontSize: 7.8, color: C.white, valign: 'top' })
  addNotes(s, {
    title: 'Subscriptions scale with operating complexity',
    emphasize: 'Restaurant tiers scale by branch and intelligence depth; supplier tiers scale by active ordering customer locations and operating depth.',
    nuance: 'Configured monthly prices are $49/$149/$349 for restaurants and $149/$349 for suppliers. Live recurring PSP automation is not production-complete.',
    transition: 'The final question is what is ready now and what remains roadmap.',
    sources: ['docs/product/four-plan-pricing-model.md', 'docs/product/plans-and-limits.md', 'apps/api/db/migrations/0212_final_intelligence_subscription_matrix.sql'],
  })
}

function plan(slide, x, y, w, data, accent, highlighted) {
  box(slide, x, y, w, 3.43, highlighted ? C.mintPale : C.white, highlighted ? C.mint : C.mist, true, true)
  if (highlighted) pill(slide, 'BEST FIT FOR GROWTH', x + 0.22, y + 0.14, 1.72, C.mint, C.white)
  text(slide, data[0], x + 0.18, y + (highlighted ? 0.5 : 0.28), w - 0.36, 0.31, { fontSize: 12.5, bold: true, color: C.ink, align: 'center' })
  text(slide, data[1], x + 0.18, y + (highlighted ? 0.95 : 0.82), w - 0.36, 0.55, { fontSize: 24, bold: true, color: accent, align: 'center' })
  text(slide, '/ month', x + 0.18, y + (highlighted ? 1.5 : 1.39), w - 0.36, 0.22, { fontSize: 8, color: C.muted, align: 'center' })
  text(slide, data[2], x + 0.22, y + 1.95, w - 0.44, 0.46, { fontSize: 8.2, bold: true, color: accent, align: 'center', valign: 'top' })
  text(slide, data[3], x + 0.23, y + 2.55, w - 0.46, 0.48, { fontSize: 8.4, color: C.ink2, align: 'center', valign: 'top' })
}

// 19 — Readiness
{
  const s = standard('Ready enough to win—honest about what comes next', 'Current state & roadmap', 'The end-to-end workflow exists today. Next work hardens production connections and closes the highest-value loops.', 19)
  const cols = [
    [0.7,C.mint,C.mintPale,'NOW','Ship & demo',['B2B ordering, pricing & quotes','Fulfillment, routes, drivers & POD','Receiving, disputes & finance','Multi-branch / warehouse foundations','Role-aware web + mobile','Read-only operational intelligence']],
    [4.48,C.amber,C.amberPale,'NEXT','Harden & connect',['Production deployment configuration','Channel provider credentials','Live recurring billing integration','Finance reconciliation workflows','Canonical timeline polish','Cross-module operating loops']],
    [8.26,C.violet,C.pale,'LATER','Expand the moat',['Closed-loop replenishment','Human-approved action-taking AI','Full central purchasing','PSP & accounting reconciliation','Road / capacity optimization','Deeper ecosystem integrations']],
  ]
  cols.forEach((c) => {
    box(s, c[0], 1.68, 3.38, 4.99, C.white, C.mist, true, true)
    box(s, c[0], 1.68, 3.38, 0.95, c[2], c[2])
    pill(s, c[3], c[0] + 0.24, 1.95, 0.72, c[1], C.white)
    text(s, c[4], c[0] + 1.07, 1.9, 1.98, 0.34, { fontSize: 13.5, bold: true, color: C.ink })
    c[5].forEach((v, i) => {
      dot(s, c[0] + 0.3, 2.98 + i * 0.56, 0.2, c[1])
      text(s, v, c[0] + 0.67, 2.92 + i * 0.56, 2.42, 0.33, { fontSize: 8.9, color: C.ink2, valign: 'top' })
    })
  })
  addNotes(s, {
    title: 'Ready enough to win—honest about what comes next',
    emphasize: 'Supplify has credible end-to-end breadth. Readiness work is focused on production connections and closing selected loops.',
    nuance: 'Implemented means present in the audited codebase and local demo path; it is not a claim of live customer adoption or third-party provider activation.',
    transition: 'Close on one connected operating layer for the whole supply relationship.',
    sources: ['PRODUCT_BUSINESS_LOGIC_AUDIT.md', 'HANDOVER_INTELLIGENCE.md', 'apps/api/src/server.js', 'apps/web/src/App.tsx'],
  })
}

// 20 — Close
{
  const s = pptx.addSlide()
  s.background = { color: C.ink }
  dot(s, -1.2, -1.75, 5.0, C.violet)
  slideFade(s, -1.2, -1.75, 5.0, 65)
  dot(s, 9.75, 4.4, 4.65, C.mint)
  slideFade(s, 9.75, 4.4, 4.65, 70)
  s.addImage({ path: LOGO, x: 6.08, y: 0.52, w: 1.17, h: 1.17 })
  text(s, 'Let’s put one connected operating\nlayer under your F&B supply.', 1.2, 1.85, 10.9, 1.2, { fontSize: 30, bold: true, color: C.white, align: 'center', valign: 'mid', breakLine: true })
  ;[['RESTAURANTS','Control'],['SUPPLIERS','Execution'],['WAREHOUSES','Coordination'],['DRIVERS','Connection']].forEach((a, i) => {
    const x = 1.29 + i * 2.73
    box(s, x, 3.4, 2.27, 1.05, '34204F', '4B3267', true, true)
    text(s, a[0], x + 0.13, 3.58, 2.01, 0.23, { fontSize: 8.6, bold: true, color: C.lavender, align: 'center', charSpacing: 1 })
    text(s, a[1], x + 0.13, 3.95, 2.01, 0.27, { fontSize: 13, bold: true, color: C.white, align: 'center' })
  })
  text(s, 'SOURCE.  ORDER.  FULFILL.  DELIVER.', 2.17, 4.75, 8.99, 0.35, { fontSize: 15, bold: true, color: C.mint, align: 'center', charSpacing: 2 })
  box(s, 3.55, 5.35, 6.2, 0.72, C.mint, C.mint, true, true)
  text(s, 'Next step: walk a live pilot journey together', 3.7, 5.52, 5.9, 0.38, { fontSize: 13.5, bold: true, color: C.ink, align: 'center' })
  text(s, 'SUPPLIFY', 5.62, 6.75, 2.1, 0.23, { fontSize: 8.5, color: C.lavender, align: 'center', charSpacing: 2.4 })
  addNotes(s, {
    title: 'Let’s put one connected operating layer under your F&B supply',
    emphasize: 'Close with invitation: choose the audience’s priority—restaurant control, supplier execution, commercial model, or pilot readiness—and schedule a live walkthrough.',
    nuance: 'Keep claims product-true; invite a demo/pilot conversation rather than promising traction metrics.',
    transition: 'End on the four verbs: Source. Order. Fulfill. Deliver.',
    sources: ['Synthesis of audited platform capabilities'],
  })
}

if (notes.length !== 20) throw new Error(`Expected 20 slides, found ${notes.length}`)

const markdown = `# Supplify Stakeholder Presentation — Source & Presenter Notes

Generated: 2026-09-30  
Deck: \`SUPPLIFY_Stakeholder_Presentation.pptx\`  
Format: 16:9 widescreen; editable text and native PowerPoint diagrams

## Positioning

Supplify is presented as a connected operating platform for F&B procurement and supply: a marketplace at the front, with workflow depth through pricing, fulfillment, delivery, receiving, finance, and operational intelligence.

## Evidence standard

- Claims were derived from the current repository, product documentation, registered API/web routes, database migrations, and matching Android/iOS source trees.
- Screenshots were captured from an isolated, locally seeded marketing-demo environment. Values shown are illustrative product data, not customer traction or production metrics.
- No external market statistics, customer logos, customer quotes, competitor metrics, or unsupported ROI figures are used.
- “Implemented” means present in the audited codebase and local demo path. It does not independently certify live customer adoption, production SRE readiness, or third-party provider activation.

## Intentional boundaries

- Delivery, receiving, invoicing, and payment are distinct milestones.
- New baskets do not silently split across arbitrary supplier tenants or warehouses.
- The assistant and intelligence features are read-only; they do not place orders, mutate inventory or pricing, or assign drivers.
- Full central purchasing, action-taking AI, live recurring PSP automation, accounting reconciliation, and advanced route optimization are roadmap or external-production work.
- Public supplier and restaurant-consumer ordering are additional channels; the core story remains B2B procurement and supply operations.

## Slide-by-slide notes

${notes.map((n, i) => `### ${String(i + 1).padStart(2, '0')} — ${n.title}

**Emphasize:** ${n.emphasize}

**Nuance:** ${n.nuance}

**Transition:** ${n.transition}

**Repository basis:**
${n.sources.map((source) => `- ${source}`).join('\n')}
`).join('\n')}
## Commercial source of truth

The current public catalog in \`docs/product/four-plan-pricing-model.md\` contains three restaurant plans and two supplier plans after a 30-day trial:

- Restaurant Growth — $49/month, 1 active branch
- Restaurant Intelligence — $149/month, 3 active branches
- Restaurant Scale — $349/month, multi-branch operations
- Supplier Growth — $149/month, 50 active ordering customer locations/month
- Supplier Scale — $349/month, 200 active ordering customer locations/month

Annual base-plan prices use the two-months-free convention (monthly × 10). Supplier Scale supports recurring add-ons for active customer-location, supplier-branch, and warehouse capacity. The repository supports manual/stub billing; live recurring payment-provider subscriptions and webhooks remain external production work.

## Visual system

- Brand colors: #5B21B6, #7C3AED, #A78BFA, #EDE9FE, #1E0B3A, #10B981
- Typeface: Segoe UI
- Product logo: \`apps/web/static/brand/supplify-logo.png\`
- Editable diagrams use native PowerPoint shapes; screenshots are replaceable bitmap assets.

## Primary repository sources

- \`PRODUCT_BUSINESS_LOGIC_AUDIT.md\`
- \`HANDOVER_INTELLIGENCE.md\`
- \`docs/product/four-plan-pricing-model.md\`
- \`docs/product/plans-and-limits.md\`
- \`apps/api/src/server.js\`
- \`apps/web/src/App.tsx\`
- \`apps/api/db/migrations/0212_final_intelligence_subscription_matrix.sql\`
- \`apps/api/db/migrations/0223_public_supplier_sales_channel.sql\`
- \`C:/myProjects/supplify-mobile/src\`
- \`C:/myProjects/supplify-mobile-ios/src\`
`

fs.writeFileSync(NOTES, markdown, 'utf8')
await pptx.writeFile({ fileName: OUT })
console.log(`Generated ${path.basename(OUT)} with ${notes.length} slides`)
console.log(`Generated ${path.basename(NOTES)}`)
