#!/usr/bin/env node
/**
 * Seven-slide stakeholder brief.
 * Same evidence standard as the 20-slide overview: product-true, seeded UI labeled,
 * no traction metrics, no unnamed-competitor scoreboard.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pptxgen from 'pptxgenjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'SUPPLIFY_Stakeholder_Brief.pptx')
const ASSETS = path.join(ROOT, 'presentation_source', 'assets', 'screenshots')
const LOGO = path.join(ROOT, 'apps', 'web', 'static', 'brand', 'supplify-logo.png')

for (const file of [LOGO, path.join(ASSETS, 'restaurant-dashboard.png'), path.join(ASSETS, 'supplier-command-center.png')]) {
  if (!fs.existsSync(file)) throw new Error(`Missing asset: ${file}`)
}

const pptx = new pptxgen()
pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 })
pptx.layout = 'WIDE'
pptx.author = 'Supplify'
pptx.company = 'Supplify'
pptx.title = 'Supplify — Stakeholder brief'
pptx.subject = 'Seven-slide stakeholder brief: the operating platform for F&B procurement and supply'
pptx.lang = 'en-US'

const C = {
  ink: '1E0B3A',
  ink2: '3D2A57',
  purple: '5B21B6',
  violet: '7C3AED',
  lavender: 'A78BFA',
  pale: 'EDE9FE',
  pale2: 'F6F3FF',
  mint: '10B981',
  mintDeep: '0F766E',
  amber: 'F59E0B',
  white: 'FFFFFF',
  off: 'F7F7FC',
  mist: 'E7E5F0',
  muted: '5C5670',
  soft: 'C4B5FD',
  cardDark: '2A1848',
  pillDark: '3B2463',
}

const FONT = 'Calibri'

function shadow() {
  return { type: 'outer', color: '1E0B3A', blur: 16, offset: 4, opacity: 0.1 }
}

function text(slide, value, x, y, w, h, options = {}) {
  slide.addText(value, {
    x, y, w, h,
    fontFace: FONT,
    fontSize: 15,
    color: C.ink2,
    margin: 0,
    valign: 'top',
    isTextBox: true,
    ...options,
  })
}

function shape(slide, kind, x, y, w, h, fill, line) {
  slide.addShape(kind, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: line || fill, width: line && line !== fill ? 1.25 : 0 },
  })
}

function card(slide, x, y, w, h, fill, line, withShadow = false) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: line || fill, width: line && line !== fill ? 1.25 : 0 },
    rectRadius: 0.12,
    ...(withShadow ? { shadow: shadow() } : {}),
  })
}

function ellipse(slide, x, y, d, fill) {
  shape(slide, pptx.ShapeType.ellipse, x, y, d, d, fill)
}

function footer(slide, page) {
  text(slide, 'SUPPLIFY   ·   STAKEHOLDER BRIEF', 0.58, 7.14, 6, 0.22, {
    fontSize: 11, color: '9A94A8', charSpacing: 1.1, margin: 0,
  })
  text(slide, String(page).padStart(2, '0'), 11.9, 7.14, 0.85, 0.22, {
    fontSize: 12, bold: true, color: C.violet, align: 'right', margin: 0,
  })
}

function kicker(slide, label) {
  text(slide, label, 0.58, 0.32, 8, 0.24, {
    fontSize: 12, bold: true, color: C.violet, charSpacing: 1.6, margin: 0,
  })
}

// ---------------------------------------------------------------------------
// 01  Open
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide()
  s.background = { color: C.ink }
  ellipse(s, 9.35, -2.35, 6.5, C.violet)
  ellipse(s, 11.15, 5.35, 3.15, C.mintDeep)

  card(s, 0.58, 0.4, 0.52, 0.52, C.white, C.white)
  s.addImage({ path: LOGO, x: 0.64, y: 0.46, w: 0.4, h: 0.4 })
  text(s, 'SUPPLIFY', 1.24, 0.48, 2.6, 0.38, {
    fontSize: 16, bold: true, color: C.white, charSpacing: 1.8, margin: 0, valign: 'middle',
  })
  card(s, 10.42, 0.46, 2.28, 0.38, C.pillDark, C.pillDark)
  text(s, 'STAKEHOLDER BRIEF', 10.42, 0.46, 2.28, 0.38, {
    fontSize: 11, bold: true, color: C.soft, align: 'center', charSpacing: 1.1, margin: 0, valign: 'middle',
  })

  text(s, 'Stop running F&B supply\nacross chats, sheets, and guesswork.', 0.58, 1.72, 8.7, 1.7, {
    fontSize: 34, bold: true, color: C.white, margin: 0,
  })
  text(s, 'Supplify is the operating platform for procurement and supply. One order, from the price you agree to the invoice you pay.', 0.58, 3.62, 8.15, 0.78, {
    fontSize: 16, color: 'DDD6FE', margin: 0,
  })

  const steps = [
    ['SOURCE', C.pillDark, C.white],
    ['ORDER', C.pillDark, C.white],
    ['FULFILL', C.pillDark, C.white],
    ['DELIVER', C.pillDark, C.white],
    ['RECEIVE', C.pillDark, C.white],
    ['CONTROL', C.mint, C.white],
  ]
  let x = 0.58
  steps.forEach(([label, fill, color], i) => {
    const w = label.length > 7 ? 1.28 : 1.16
    card(s, x, 4.62, w, 0.4, fill, fill)
    text(s, label, x, 4.62, w, 0.4, {
      fontSize: 12, bold: true, color, align: 'center', margin: 0, valign: 'middle', charSpacing: 0.6,
    })
    x += w
    if (i < steps.length - 1) {
      text(s, '→', x, 4.62, 0.28, 0.4, {
        fontSize: 14, color: C.lavender, align: 'center', margin: 0, valign: 'middle',
      })
      x += 0.28
    }
  })

  card(s, 0.58, 5.28, 8.35, 0.78, C.cardDark, C.cardDark)
  text(s, 'Built for restaurant teams and suppliers who need the work after checkout—not another catalog inbox.', 0.82, 5.28, 7.9, 0.78, {
    fontSize: 15, color: C.white, margin: 0, valign: 'middle',
  })

  text(s, 'October 2026', 0.58, 6.9, 2.4, 0.24, { fontSize: 12, color: C.lavender, margin: 0 })
  text(s, 'Product-ready platform   ·   Pilot-ready conversation', 6.3, 6.9, 6.4, 0.24, {
    fontSize: 12, color: '6EE7B7', align: 'right', margin: 0,
  })

  s.addNotes(
    'Open on the pain, then the category. Supplify is not a catalog with an inbox. It is the shared operating record for an F&B order.\n\n' +
    'Do not claim customers, revenue, or ROI. The product is ready to walk. A pilot is the proof.\n\n' +
    'If they ask “marketplace or ERP?”: both, in sequence. Discovery is the front door. Pricing, fulfillment, delivery, receiving, and finance are why the door is worth opening.',
  )
}

// ---------------------------------------------------------------------------
// 02  The cost
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide()
  s.background = { color: C.off }
  kicker(s, 'THE OPERATING PROBLEM')
  text(s, 'Every order still dies in a group chat.', 0.56, 0.58, 12.2, 0.5, {
    fontSize: 30, bold: true, color: C.ink, margin: 0,
  })
  text(s, 'Buying can start in a catalog. The truth scatters the moment the work begins.', 0.58, 1.16, 11.5, 0.32, {
    fontSize: 16, color: C.muted, margin: 0,
  })

  const rows = [
    ['01', C.violet, 'Discovery', 'Who sells it, what it costs, and whether it is there live in different places.'],
    ['02', C.purple, 'Terms', 'Contract price, quote, promotion, and minimum get reconciled by hand.'],
    ['03', C.amber, 'Execution', 'A thread, a call, and a spreadsheet become the operating system.'],
    ['04', 'E11D48', 'Close', 'What shipped, what arrived, what was accepted, and what was invoiced become four stories.'],
  ]
  shape(s, pptx.ShapeType.rect, 0.84, 2.05, 0.035, 3.55, 'E4E0F0')
  rows.forEach((row, i) => {
    const y = 1.78 + i * 1.18
    ellipse(s, 0.62, y, 0.48, row[1])
    text(s, row[0], 0.62, y, 0.48, 0.48, {
      fontSize: 12, bold: true, color: C.white, align: 'center', margin: 0, valign: 'middle',
    })
    text(s, row[2], 1.32, y + 0.02, 2.15, 0.44, {
      fontSize: 18, bold: true, color: C.ink, margin: 0, valign: 'middle',
    })
    text(s, row[3], 3.5, y, 4.15, 0.7, {
      fontSize: 15, color: C.muted, margin: 0, valign: 'middle',
    })
  })

  card(s, 8.05, 1.72, 4.7, 4.95, C.ink, C.ink, true)
  text(s, 'THE REAL COST', 8.4, 2.05, 4.0, 0.28, {
    fontSize: 12, bold: true, color: C.lavender, charSpacing: 1.4, margin: 0,
  })
  text(s, 'Your team reconstructs yesterday instead of controlling tomorrow.', 8.4, 2.55, 4.0, 1.7, {
    fontSize: 26, bold: true, color: C.white, margin: 0,
  })
  card(s, 8.4, 5.85, 4.0, 0.46, C.violet, C.violet)
  text(s, 'ONE ORDER  ·  MANY VERSIONS OF TRUTH', 8.4, 5.85, 4.0, 0.46, {
    fontSize: 11, bold: true, color: C.white, align: 'center', margin: 0, valign: 'middle', charSpacing: 0.4,
  })
  footer(s, 2)
  s.addNotes(
    'Stay on workflow, not market size. The cost is not “they lack software.” The cost is that one commercial event becomes several unofficial records.\n\n' +
    'Discovery, terms, execution, and close are the four places a stakeholder will recognize their own week. Do not invent hours saved or error rates.\n\n' +
    'Transition: Supplify does not add a fifth tool. It keeps those four stages on one order.',
  )
}

// ---------------------------------------------------------------------------
// 03  Category
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide()
  s.background = { color: C.off }
  kicker(s, 'WHY THIS WINS')
  text(s, 'Where others stop at “order placed,” Supplify keeps going.', 0.56, 0.58, 12.2, 0.52, {
    fontSize: 28, bold: true, color: C.ink, margin: 0,
  })
  text(s, 'A marketplace introduces two parties. An operating platform keeps the order true after the handshake.', 0.58, 1.18, 12, 0.32, {
    fontSize: 16, color: C.muted, margin: 0,
  })

  card(s, 0.55, 1.72, 4.15, 5.05, C.white, C.white, true)
  card(s, 1.15, 1.98, 2.95, 0.36, C.mist, C.mist)
  text(s, 'TYPICAL MARKETPLACE', 1.15, 1.98, 2.95, 0.36, {
    fontSize: 11, bold: true, color: C.muted, align: 'center', margin: 0, valign: 'middle', charSpacing: 0.8,
  })
  const market = [
    ['1', 'Discover', 'Find a supplier'],
    ['2', 'Browse', 'See a catalog'],
    ['3', 'Order', 'Submit demand'],
  ]
  market.forEach((row, i) => {
    const y = 2.62 + i * 0.95
    ellipse(s, 0.9, y, 0.46, 'D9D6E3')
    text(s, row[0], 0.9, y, 0.46, 0.46, {
      fontSize: 14, bold: true, color: '6B6578', align: 'center', margin: 0, valign: 'middle',
    })
    text(s, row[1], 1.55, y, 2.7, 0.26, { fontSize: 16, bold: true, color: C.ink, margin: 0 })
    text(s, row[2], 1.55, y + 0.26, 2.7, 0.24, { fontSize: 13, color: C.muted, margin: 0 })
  })
  text(s, 'VALUE STOPS AT THE HANDOFF', 0.8, 6.15, 3.65, 0.28, {
    fontSize: 12, bold: true, color: '9A94A8', align: 'center', margin: 0, charSpacing: 0.6,
  })

  card(s, 4.95, 1.72, 7.8, 5.05, C.ink, C.ink, true)
  card(s, 5.25, 1.98, 1.7, 0.36, C.violet, C.violet)
  text(s, 'SUPPLIFY', 5.25, 1.98, 1.7, 0.36, {
    fontSize: 12, bold: true, color: C.white, align: 'center', margin: 0, valign: 'middle', charSpacing: 0.8,
  })

  const flow = [
    ['1', 'SOURCE', C.violet],
    ['2', 'PRICE', C.violet],
    ['3', 'ORDER', C.purple],
    ['4', 'FULFILL', C.amber],
    ['5', 'DELIVER', 'F97316'],
    ['6', 'RECEIVE', C.mint],
    ['7', 'RECONCILE', '059669'],
    ['8', 'LEARN', '2563EB'],
  ]
  flow.forEach((step, i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = 5.45 + col * 1.8
    const y = 2.7 + row * 1.55
    ellipse(s, x, y, 0.58, step[2])
    text(s, step[0], x, y, 0.58, 0.58, {
      fontSize: 16, bold: true, color: C.white, align: 'center', margin: 0, valign: 'middle',
    })
    text(s, step[1], x - 0.25, y + 0.66, 1.1, 0.28, {
      fontSize: 12, bold: true, color: C.white, align: 'center', margin: 0,
    })
    if (col < 3) {
      text(s, '→', x + 0.62, y + 0.08, 0.4, 0.4, {
        fontSize: 14, color: row === 0 ? C.lavender : '6EE7B7', align: 'center', margin: 0,
      })
    }
  })
  text(s, 'VALUE COMPOUNDS AFTER THE ORDER', 5.2, 6.15, 7.3, 0.28, {
    fontSize: 13, bold: true, color: '6EE7B7', align: 'center', margin: 0, charSpacing: 0.7,
  })
  footer(s, 3)
  s.addNotes(
    'This is a category contrast, not a named competitor. Do not cite other vendors.\n\n' +
    'The line to land: a marketplace is paid for the introduction. Supplify is valuable because the order still has an owner after checkout—price, warehouse, driver, receiver, invoice.\n\n' +
    'LEARN means the accepted order feeds inventory, payables, and reporting. It does not mean autonomous replenishment. That is later.',
  )
}

// ---------------------------------------------------------------------------
// 04  Both sides
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide()
  s.background = { color: C.off }
  kicker(s, 'THE SAME ORDER')
  text(s, 'Restaurants get control. Suppliers get a plan they can run.', 0.56, 0.56, 12.2, 0.48, {
    fontSize: 28, bold: true, color: C.ink, margin: 0,
  })
  text(s, 'The buyer sees the relationship. The supplier sees the work. Both are looking at one transaction.', 0.58, 1.1, 12, 0.3, {
    fontSize: 16, color: C.muted, margin: 0,
  })

  const sides = [
    {
      x: 0.55,
      kicker: 'RESTAURANTS',
      kickerFill: C.pale,
      kickerColor: C.purple,
      line: 'Control—not another shopping cart.',
      shot: 'restaurant-dashboard.png',
      close: 'Purchasing, receiving, stock, and payables stay on one history.',
    },
    {
      x: 6.92,
      kicker: 'SUPPLIERS',
      kickerFill: 'EDE9FE',
      kickerColor: C.purple,
      line: 'A plan—not another order inbox.',
      shot: 'supplier-command-center.png',
      close: 'Customer terms in. Warehouse, route, proof, and receivable out.',
    },
  ]
  sides.forEach((side) => {
    card(s, side.x, 1.58, 5.86, 5.22, C.white, C.white, true)
    card(s, side.x + 0.22, 1.76, 1.7, 0.32, side.kickerFill, side.kickerFill)
    text(s, side.kicker, side.x + 0.22, 1.76, 1.7, 0.32, {
      fontSize: 11, bold: true, color: side.kickerColor, align: 'center', margin: 0, valign: 'middle', charSpacing: 0.7,
    })
    text(s, side.line, side.x + 2.05, 1.74, 3.55, 0.36, {
      fontSize: 14, bold: true, color: C.ink, margin: 0, valign: 'middle',
    })
    const ix = side.x + 0.22
    const iy = 2.24
    const iw = 5.42
    const ih = 3.39
    s.addImage({ path: path.join(ASSETS, side.shot), x: ix, y: iy, w: iw, h: ih })
    card(s, ix + 0.14, iy + ih - 0.42, 2.15, 0.3, C.ink, C.ink)
    text(s, 'SEEDED DEMO UI', ix + 0.14, iy + ih - 0.42, 2.15, 0.3, {
      fontSize: 10, bold: true, color: C.white, align: 'center', margin: 0, valign: 'middle', charSpacing: 0.5,
    })
    text(s, side.close, side.x + 0.22, 5.76, 5.42, 0.78, {
      fontSize: 14, color: C.ink2, margin: 0, valign: 'middle',
    })
  })
  footer(s, 4)
  s.addNotes(
    'Walk one order, not two products. Point at the restaurant dashboard as the buyer’s control layer, then the supplier command center as the same order turned into today’s work.\n\n' +
    'Say out loud that the screens are seeded demo data. Numbers on screen are illustrative.\n\n' +
    'Nuance if asked: a new basket resolves to one compatible supplier tenant and warehouse. Full central purchasing across every branch is not complete. Public menus and public catalogs exist; they are channels around this B2B core, not the story.',
  )
}

// ---------------------------------------------------------------------------
// 05  The record
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide()
  s.background = { color: C.off }
  kicker(s, 'HOW THE RECORD STAYS TRUE')
  text(s, 'Delivered is not received. Invoiced is not paid.', 0.56, 0.56, 12.2, 0.48, {
    fontSize: 30, bold: true, color: C.ink, margin: 0,
  })
  text(s, 'Same order. Separate events. Mixing them is how disputes start.', 0.58, 1.12, 12, 0.3, {
    fontSize: 16, color: C.muted, margin: 0,
  })

  const moments = [
    ['1', C.violet, 'Source', 'Catalog\nRelationship\nRFQ'],
    ['2', C.purple, 'Commit', 'Price resolves\nQuote locks\nServer rechecks'],
    ['3', '6D28D9', 'Fulfill', 'Reserve\nPick and pack\nAssign'],
    ['4', C.amber, 'Deliver', 'Route\nDriver status\nProof'],
    ['5', C.mint, 'Reconcile', 'Receive\nDispute\nInvoice and pay'],
  ]
  moments.forEach((m, i) => {
    const x = 0.55 + i * 2.52
    card(s, x, 1.62, 2.38, 3.22, C.white, C.white, true)
    ellipse(s, x + 0.9, 1.82, 0.52, m[1])
    text(s, m[0], x + 0.9, 1.82, 0.52, 0.52, {
      fontSize: 16, bold: true, color: C.white, align: 'center', margin: 0, valign: 'middle',
    })
    text(s, m[2].toUpperCase(), x + 0.12, 2.48, 2.14, 0.36, {
      fontSize: 15, bold: true, color: C.ink, align: 'center', margin: 0,
    })
    text(s, m[3], x + 0.16, 2.92, 2.06, 1.55, {
      fontSize: 14, color: C.muted, align: 'center', margin: 0,
    })
    if (i < moments.length - 1) {
      text(s, '→', x + 2.28, 2.85, 0.28, 0.32, {
        fontSize: 14, color: C.lavender, align: 'center', margin: 0,
      })
    }
  })

  card(s, 0.55, 5.05, 6.2, 1.78, C.pale2, C.pale2)
  text(s, 'THE PRICE LOCKS', 0.8, 5.22, 5.7, 0.28, {
    fontSize: 12, bold: true, color: C.purple, charSpacing: 0.8, margin: 0,
  })
  text(s, 'Checkout revalidates on the server. The order line becomes a snapshot—not a live link back to the catalog.', 0.8, 5.56, 5.7, 1.05, {
    fontSize: 15, color: C.ink2, margin: 0,
  })

  card(s, 6.95, 5.05, 5.82, 1.78, 'ECFDF5', 'ECFDF5')
  text(s, 'INTELLIGENCE EXPLAINS', 7.2, 5.22, 5.35, 0.28, {
    fontSize: 12, bold: true, color: '047857', charSpacing: 0.8, margin: 0,
  })
  text(s, 'It is read-only. It does not place orders, move stock, set prices, or assign drivers.', 7.2, 5.56, 5.35, 1.05, {
    fontSize: 15, color: C.ink2, margin: 0,
  })
  footer(s, 5)
  s.addNotes(
    'This is the trust slide. Land the inequality slowly: delivered, received, invoiced, and paid are different events. Invoices follow accepted quantities.\n\n' +
    'Pricing: catalog, then relationship price, then a committed quote. The server rechecks at checkout. After that, the line is history.\n\n' +
    'If they ask about AI: current intelligence calculates and explains inside the user’s permissions. Action-taking AI is roadmap. Do not demo it as an agent that buys.',
  )
}

// ---------------------------------------------------------------------------
// 06  Commercial
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide()
  s.background = { color: C.off }
  kicker(s, 'HOW YOU START')
  text(s, 'Pay for operating depth, not a longer menu.', 0.56, 0.54, 12.2, 0.46, {
    fontSize: 30, bold: true, color: C.ink, margin: 0,
  })
  text(s, 'Thirty days to try it. Then the plan follows branches, active customer locations, and how deep you run.', 0.58, 1.06, 12, 0.3, {
    fontSize: 16, color: C.muted, margin: 0,
  })

  text(s, 'RESTAURANTS', 0.58, 1.5, 3, 0.24, {
    fontSize: 12, bold: true, color: C.violet, charSpacing: 1.1, margin: 0,
  })
  text(s, 'SUPPLIERS', 8.15, 1.5, 3, 0.24, {
    fontSize: 12, bold: true, color: '047857', charSpacing: 1.1, margin: 0,
  })

  const plans = [
    { name: 'Growth', price: '$49', fit: '1 active branch', detail: 'Core purchasing\nand operations', accent: C.violet, x: 0.55 },
    { name: 'Intelligence', price: '$149', fit: '3 active branches', detail: 'Operational\nintelligence', accent: C.violet, x: 3.05 },
    { name: 'Scale', price: '$349', fit: 'Multi-branch', detail: 'Advanced controls\nand assistant', accent: C.violet, x: 5.55 },
    { name: 'Growth', price: '$149', fit: '50 customer locations', detail: 'Core sales\nand operations', accent: C.mint, x: 8.2 },
    { name: 'Scale', price: '$349', fit: '200 customer locations', detail: 'Multi-warehouse\nand intelligence', accent: C.mint, x: 10.7 },
  ]
  plans.forEach((p) => {
    card(s, p.x, 1.84, 2.35, 3.05, C.white, C.white, true)
    text(s, p.name, p.x + 0.14, 2.0, 2.07, 0.32, {
      fontSize: 16, bold: true, color: C.ink, align: 'center', margin: 0,
    })
    text(s, p.price, p.x + 0.14, 2.36, 2.07, 0.52, {
      fontSize: 32, bold: true, color: p.accent, align: 'center', margin: 0,
    })
    text(s, 'per month', p.x + 0.14, 2.9, 2.07, 0.24, {
      fontSize: 12, color: C.muted, align: 'center', margin: 0,
    })
    text(s, p.fit, p.x + 0.1, 3.26, 2.15, 0.52, {
      fontSize: 12, bold: true, color: p.accent, align: 'center', margin: 0,
    })
    text(s, p.detail, p.x + 0.16, 3.82, 2.03, 0.8, {
      fontSize: 13, color: C.muted, align: 'center', margin: 0,
    })
  })

  card(s, 0.55, 5.08, 12.22, 1.78, C.ink, C.ink)
  const facts = [
    ['ANNUAL', 'Pay for ten months. The year is covered.'],
    ['IN THE PRODUCT', 'Web, Android, and iOS. The order runs through to finance.'],
    ['NOT IN THIS RELEASE', 'Live recurring billing, action-taking AI, full central purchasing.'],
  ]
  facts.forEach((f, i) => {
    const x = 0.82 + i * 4.0
    text(s, f[0], x, 5.28, 3.7, 0.28, {
      fontSize: 12, bold: true, color: i === 2 ? 'FDBA74' : '6EE7B7', charSpacing: 0.7, margin: 0,
    })
    text(s, f[1], x, 5.64, 3.7, 0.95, {
      fontSize: 14, color: C.white, margin: 0,
    })
  })
  footer(s, 6)
  s.addNotes(
    'Prices are the current configured public catalog, after a 30-day trial.\n\n' +
    'Restaurants: Growth $49 / 1 branch, Intelligence $149 / 3 branches, Scale $349 / multi-branch.\n' +
    'Suppliers: Growth $149 / 50 active ordering customer locations a month, Scale $349 / 200. Scale can add location, branch, and warehouse capacity.\n\n' +
    'Annual base price is monthly times ten. Say the billing truth in the same breath as the price: the product can record a subscription; live recurring payment-provider charging is external production work, not something to promise in a pilot.\n\n' +
    'Do not pick a “best plan” for them on this slide. Ask how many branches or active customer locations they run, then point.',
  )
}

// ---------------------------------------------------------------------------
// 07  Close
// ---------------------------------------------------------------------------
{
  const s = pptx.addSlide()
  s.background = { color: C.ink }
  ellipse(s, -2.4, -2.5, 5.6, C.violet)
  ellipse(s, 11.05, 5.15, 3.4, C.mintDeep)

  card(s, 6.4, 0.38, 0.54, 0.54, C.white, C.white)
  s.addImage({ path: LOGO, x: 6.46, y: 0.44, w: 0.42, h: 0.42 })

  text(s, 'Let’s put one connected operating layer\nunder your F&B supply.', 1.3, 1.15, 10.7, 1.35, {
    fontSize: 32, bold: true, color: C.white, align: 'center', margin: 0,
  })

  const roles = [
    ['RESTAURANTS', 'Control'],
    ['SUPPLIERS', 'Execution'],
    ['WAREHOUSES', 'Coordination'],
    ['DRIVERS', 'Connection'],
  ]
  roles.forEach((role, i) => {
    const x = 0.7 + i * 3.15
    card(s, x, 2.75, 2.95, 1.15, C.cardDark, C.cardDark)
    text(s, role[0], x + 0.12, 2.88, 2.7, 0.32, {
      fontSize: 11, bold: true, color: C.lavender, align: 'center', margin: 0, charSpacing: 0.9,
    })
    text(s, role[1], x + 0.12, 3.22, 2.7, 0.46, {
      fontSize: 20, bold: true, color: C.white, align: 'center', margin: 0,
    })
  })

  text(s, 'SOURCE.    ORDER.    FULFILL.    DELIVER.', 0.8, 4.2, 11.7, 0.4, {
    fontSize: 16, bold: true, color: '6EE7B7', align: 'center', margin: 0, charSpacing: 1.2,
  })

  card(s, 3.15, 4.85, 7.05, 0.72, C.mint, C.mint)
  text(s, 'Next step: walk one live order, end to end', 3.15, 4.85, 7.05, 0.72, {
    fontSize: 18, bold: true, color: C.ink, align: 'center', margin: 0, valign: 'middle',
  })

  text(s, 'The workflow is in the product. A pilot is the proof.', 2.2, 5.8, 8.9, 0.32, {
    fontSize: 14, color: C.soft, align: 'center', margin: 0,
  })
  text(s, 'SUPPLIFY', 0.8, 6.85, 11.7, 0.24, {
    fontSize: 12, bold: true, color: C.lavender, align: 'center', margin: 0, charSpacing: 2.2,
  })

  s.addNotes(
    'Close on a choice, not a feature recap. Ask which room they want to walk first: restaurant control, supplier execution, the commercial model, or a pilot on one real order.\n\n' +
    'The ask is a live journey—one order from price to proof to invoice—not a second presentation.\n\n' +
    'Hold the line on evidence. Implemented means it is in the product and can be shown. It is not a claim of live customers, production billing, or an AI that acts.\n\n' +
    'Leave them with four verbs: source, order, fulfill, deliver.',
  )
}

await pptx.writeFile({ fileName: OUT })
console.log(OUT)
