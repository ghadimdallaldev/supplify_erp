#!/usr/bin/env node
/**
 * Premium customer sales deck (projector-ready).
 * Output: docs/onboarding/output/Supplify-Customer-Presentation.pptx
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pptxgen from 'pptxgenjs'
import { BRAND, TAGLINE, SUBTITLE } from './onboarding/customer-brand.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'docs/onboarding/output/Supplify-Customer-Presentation.pptx')

const C = BRAND

function n({ message, say, value, q, a, next }) {
  return [
    message && `◆ ${message}`,
    say && `\nSAY:\n${say}`,
    value && `\nVALUE:\n${value}`,
    q && `\nQ: ${q}`,
    a && `A: ${a}`,
    next && `\n→ ${next}`,
  ]
    .filter(Boolean)
    .join('')
}

function accentBar(slide, pptx) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.06,
    fill: { color: C.caramel },
    line: { color: C.caramel },
  })
}

function footer(slide, text = 'Supplify · Customer overview') {
  slide.addText(text, {
    x: 0.5,
    y: 5.35,
    w: 9,
    h: 0.25,
    fontSize: 8,
    color: C.muted,
    fontFace: 'Segoe UI',
  })
}

function slideCover(pptx) {
  const s = pptx.addSlide()
  s.background = { color: C.cream }
  s.addShape(pptx.ShapeType.ellipse, {
    x: 7.2,
    y: -0.8,
    w: 3.5,
    h: 3.5,
    fill: { color: C.caramelPale, transparency: 40 },
    line: { color: C.caramelPale },
  })
  s.addShape(pptx.ShapeType.ellipse, {
    x: -1.2,
    y: 3.8,
    w: 3,
    h: 3,
    fill: { color: C.caramel, transparency: 88 },
    line: { color: C.caramel, transparency: 88 },
  })
  s.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 4.85,
    w: 2.2,
    h: 0.05,
    fill: { color: C.caramel },
    line: { color: C.caramel },
  })
  s.addText('Supplify', {
    x: 0.55,
    y: 1.35,
    w: 8,
    h: 1,
    fontSize: 54,
    bold: true,
    color: C.caramel,
    fontFace: 'Georgia',
  })
  s.addText(TAGLINE, {
    x: 0.55,
    y: 2.35,
    w: 8.5,
    h: 0.55,
    fontSize: 22,
    color: C.inkSoft,
    fontFace: 'Segoe UI',
    bold: true,
  })
  s.addText(SUBTITLE, {
    x: 0.55,
    y: 2.95,
    w: 7.5,
    h: 0.7,
    fontSize: 13,
    color: C.muted,
    fontFace: 'Segoe UI',
  })
  const pills = ['Ordering', 'Fulfillment', 'Receiving', 'Finance']
  pills.forEach((p, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55 + i * 2.15,
      y: 3.85,
      w: 1.95,
      h: 0.38,
      fill: { color: C.white },
      line: { color: C.caramelLight, width: 1 },
      rectRadius: 0.15,
    })
    s.addText(p, {
      x: 0.55 + i * 2.15,
      y: 3.9,
      w: 1.95,
      h: 0.3,
      fontSize: 9,
      color: C.caramel,
      align: 'center',
      fontFace: 'Segoe UI',
      bold: true,
    })
  })
  s.addNotes(
    n({
      message: 'Open with confidence — Supplify is the operating layer between restaurants and suppliers.',
      say: 'Thank you for your time. Supplify connects restaurants and food suppliers from the first order through delivery, receiving, and payment — one platform, one shared record.',
      next: 'Frame the problem they feel every week.',
    })
  )
}

function slideSection(pptx, title, subtitle) {
  const s = pptx.addSlide()
  s.background = { color: C.caramel }
  s.addText(title, {
    x: 0.6,
    y: 2.1,
    w: 8.8,
    h: 1,
    fontSize: 36,
    bold: true,
    color: C.white,
    fontFace: 'Georgia',
  })
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.6,
      y: 3.15,
      w: 8,
      h: 0.6,
      fontSize: 14,
      color: C.caramelPale,
      fontFace: 'Segoe UI',
    })
  }
  s.addNotes(n({ message: title, say: subtitle || '' }))
  return s
}

function slideBullets(pptx, { title, bullets, diagram, notes }) {
  const s = pptx.addSlide()
  s.background = { color: C.cream }
  accentBar(s, pptx)
  s.addText(title, {
    x: 0.55,
    y: 0.45,
    w: 9,
    h: 0.65,
    fontSize: 26,
    bold: true,
    color: C.caramel,
    fontFace: 'Georgia',
  })
  const bx = diagram ? 0.55 : 0.55
  const bw = diagram ? 4.35 : 8.9
  s.addText(
    bullets.map((t) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true } })),
    {
      x: bx,
      y: 1.2,
      w: bw,
      h: 4,
      fontSize: 14,
      color: C.inkSoft,
      fontFace: 'Segoe UI',
      valign: 'top',
      paraSpaceAfter: 8,
    }
  )
  if (diagram) {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 5.15,
      y: 1.05,
      w: 4.35,
      h: 4.05,
      fill: { color: C.white },
      line: { color: C.caramelLight, width: 1.5 },
      rectRadius: 0.08,
    })
    s.addText(diagram, {
      x: 5.35,
      y: 1.25,
      w: 4,
      h: 3.7,
      fontSize: 11,
      color: C.ink,
      fontFace: 'Consolas',
      valign: 'top',
    })
  }
  footer(s)
  if (notes) s.addNotes(notes)
}

function slideBeforeAfter(pptx) {
  const s = pptx.addSlide()
  s.background = { color: C.cream }
  accentBar(s, pptx)
  s.addText('Before Supplify → After Supplify', {
    x: 0.55,
    y: 0.45,
    w: 9,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: C.caramel,
    fontFace: 'Georgia',
  })
  ;[
    { col: 'Before', items: ['Phone & text orders', 'Delivery guesswork', 'Invoice arguments', 'Siloed tools'] },
    { col: 'After', items: ['Digital order record', 'Shared status & GPS', 'Receive → invoice match', 'One platform'] },
  ].forEach((side, i) => {
    const x = 0.55 + i * 4.65
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.2,
      w: 4.35,
      h: 3.85,
      fill: { color: i === 0 ? C.creamDark : C.white },
      line: { color: i === 0 ? C.caramelLight : C.caramel, width: i === 0 ? 1 : 2 },
      rectRadius: 0.08,
    })
    s.addText(side.col, {
      x,
      y: 1.35,
      w: 4.35,
      h: 0.45,
      fontSize: 16,
      bold: true,
      color: i === 0 ? C.muted : C.caramel,
      align: 'center',
      fontFace: 'Georgia',
    })
    s.addText(
      side.items.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      {
        x: x + 0.25,
        y: 1.95,
        w: 3.85,
        h: 2.8,
        fontSize: 13,
        color: C.inkSoft,
        fontFace: 'Segoe UI',
      }
    )
  })
  footer(s)
  s.addNotes(n({ say: 'Paint the contrast vividly — ask which column feels like their Tuesday.' }))
}

function slideDayInLife(pptx) {
  const s = pptx.addSlide()
  s.background = { color: C.cream }
  accentBar(s, pptx)
  s.addText('A Tuesday with Supplify', {
    x: 0.55,
    y: 0.45,
    w: 9,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: C.caramel,
    fontFace: 'Georgia',
  })
  const moments = [
    { time: '7:00', who: 'Restaurant', what: 'Purchaser submits quick-list order to 3 suppliers' },
    { time: '7:15', who: 'Supplier', what: 'Inbox notification — accept & schedule pick' },
    { time: '10:30', who: 'Driver', what: 'Status: out for delivery · GPS active' },
    { time: '11:00', who: 'Restaurant', what: 'Receiving confirms qty · inventory updates' },
    { time: '11:05', who: 'Both', what: 'Invoice issued · finance reconciles automatically' },
  ]
  moments.forEach((m, i) => {
    const y = 1.15 + i * 0.82
    s.addShape(pptx.ShapeType.rect, {
      x: 0.55,
      y,
      w: 1.1,
      h: 0.65,
      fill: { color: C.caramel },
      line: { color: C.caramel },
    })
    s.addText(m.time, {
      x: 0.55,
      y: y + 0.12,
      w: 1.1,
      h: 0.4,
      fontSize: 11,
      bold: true,
      color: C.white,
      align: 'center',
      fontFace: 'Segoe UI',
    })
    s.addText(m.who, {
      x: 1.85,
      y: y + 0.02,
      w: 1.5,
      h: 0.35,
      fontSize: 10,
      bold: true,
      color: C.caramel,
      fontFace: 'Segoe UI',
    })
    s.addText(m.what, {
      x: 1.85,
      y: y + 0.32,
      w: 7.5,
      h: 0.4,
      fontSize: 12,
      color: C.inkSoft,
      fontFace: 'Segoe UI',
    })
  })
  footer(s)
  s.addNotes(n({ say: 'Tell this as a story — one morning, no heroics, just the platform working.' }))
}

function slideQuote(pptx, quote, attribution) {
  const s = pptx.addSlide()
  s.background = { color: C.creamDark }
  s.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 1.8,
    w: 0.08,
    h: 2.2,
    fill: { color: C.caramel },
    line: { color: C.caramel },
  })
  s.addText(`"${quote}"`, {
    x: 1.15,
    y: 1.75,
    w: 8,
    h: 2.2,
    fontSize: 28,
    italic: true,
    color: C.caramel,
    fontFace: 'Georgia',
    valign: 'middle',
  })
  if (attribution) {
    s.addText(attribution, {
      x: 1.15,
      y: 4.1,
      w: 8,
      h: 0.4,
      fontSize: 12,
      color: C.muted,
      fontFace: 'Segoe UI',
    })
  }
  footer(s)
}

function slidePillars(pptx, pillars) {
  const s = pptx.addSlide()
  s.background = { color: C.cream }
  accentBar(s, pptx)
  s.addText('Built for both sides of the relationship', {
    x: 0.55,
    y: 0.45,
    w: 9,
    h: 0.6,
    fontSize: 26,
    bold: true,
    color: C.caramel,
    fontFace: 'Georgia',
  })
  pillars.forEach((p, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 0.55 + col * 4.65
    const y = 1.25 + row * 2.05
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 4.35,
      h: 1.85,
      fill: { color: C.white },
      line: { color: C.caramelLight },
      rectRadius: 0.06,
    })
    s.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 4.35,
      h: 0.06,
      fill: { color: C.caramel },
      line: { color: C.caramel },
    })
    s.addText(p.title, {
      x: x + 0.2,
      y: y + 0.2,
      w: 4,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: C.caramel,
      fontFace: 'Segoe UI',
    })
    s.addText(p.body, {
      x: x + 0.2,
      y: y + 0.65,
      w: 3.95,
      h: 1.05,
      fontSize: 11,
      color: C.muted,
      fontFace: 'Segoe UI',
    })
  })
  footer(s)
}

function slideTimeline(pptx) {
  const s = pptx.addSlide()
  s.background = { color: C.cream }
  accentBar(s, pptx)
  s.addText('The order journey — one shared thread', {
    x: 0.55,
    y: 0.45,
    w: 9,
    h: 0.6,
    fontSize: 26,
    bold: true,
    color: C.caramel,
    fontFace: 'Georgia',
  })
  const steps = [
    { n: '1', t: 'Order', d: 'Restaurant checks out' },
    { n: '2', t: 'Confirm', d: 'Supplier accepts' },
    { n: '3', t: 'Fulfill', d: 'Pick & dispatch' },
    { n: '4', t: 'Deliver', d: 'Driver completes' },
    { n: '5', t: 'Receive', d: 'Restaurant confirms' },
    { n: '6', t: 'Invoice', d: 'Pay with clarity' },
  ]
  steps.forEach((st, i) => {
    const x = 0.45 + i * 1.55
    s.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.35,
      y: 1.35,
      w: 0.75,
      h: 0.75,
      fill: { color: C.caramel },
      line: { color: C.caramel },
    })
    s.addText(st.n, {
      x: x + 0.35,
      y: 1.45,
      w: 0.75,
      h: 0.55,
      fontSize: 16,
      bold: true,
      color: C.white,
      align: 'center',
      fontFace: 'Segoe UI',
    })
    if (i < steps.length - 1) {
      s.addShape(pptx.ShapeType.line, {
        x: x + 1.05,
        y: 1.72,
        w: 0.55,
        h: 0,
        line: { color: C.caramelLight, width: 2 },
      })
    }
    s.addText(st.t, {
      x: x,
      y: 2.25,
      w: 1.45,
      h: 0.35,
      fontSize: 11,
      bold: true,
      color: C.caramel,
      align: 'center',
      fontFace: 'Segoe UI',
    })
    s.addText(st.d, {
      x: x,
      y: 2.6,
      w: 1.45,
      h: 0.55,
      fontSize: 9,
      color: C.muted,
      align: 'center',
      fontFace: 'Segoe UI',
    })
  })
  s.addText(
    'Amendments, substitutions, and disputes stay on the same order — no lost context.',
    {
      x: 0.55,
      y: 3.5,
      w: 8.9,
      h: 0.5,
      fontSize: 13,
      italic: true,
      color: C.inkSoft,
      fontFace: 'Georgia',
      align: 'center',
    }
  )
  footer(s)
  s.addNotes(
    n({
      say: 'Walk through one order. Emphasize both sides see the same status at every step.',
      q: 'What if something is short?',
      a: 'Amendments before delivery; disputes after receiving — always on the order record.',
    })
  )
}

function slidePlans(pptx) {
  const s = pptx.addSlide()
  s.background = { color: C.cream }
  accentBar(s, pptx)
  s.addText('Plans that scale with you', {
    x: 0.55,
    y: 0.45,
    w: 9,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: C.caramel,
    fontFace: 'Georgia',
  })
  const plans = [
    { name: 'Free Trial', desc: 'Evaluate with real partners', color: C.caramelPale },
    { name: 'Silver', desc: 'Single location, daily use', color: C.caramelLight },
    { name: 'Gold', desc: 'Drivers, branches, smart reorder', color: C.caramelMid },
    { name: 'Platinum', desc: 'Multi-site & advanced analytics', color: C.caramel },
  ]
  plans.forEach((p, i) => {
    const x = 0.55 + i * 2.28
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.35,
      w: 2.1,
      h: 3.5,
      fill: { color: C.white },
      line: { color: p.color, width: 2 },
      rectRadius: 0.08,
    })
    s.addText(p.name, {
      x,
      y: 1.55,
      w: 2.1,
      h: 0.5,
      fontSize: 13,
      bold: true,
      color: C.caramel,
      align: 'center',
      fontFace: 'Segoe UI',
    })
    s.addText(p.desc, {
      x: x + 0.15,
      y: 2.2,
      w: 1.8,
      h: 2.2,
      fontSize: 10,
      color: C.muted,
      align: 'center',
      fontFace: 'Segoe UI',
      valign: 'top',
    })
  })
  s.addText('Restaurants and suppliers each choose their tier · Your rep shares current pricing', {
    x: 0.55,
    y: 5.05,
    w: 9,
    h: 0.3,
    fontSize: 9,
    color: C.muted,
    align: 'center',
    fontFace: 'Segoe UI',
  })
  footer(s)
}

function slideCta(pptx) {
  const s = pptx.addSlide()
  s.background = { color: C.caramel }
  s.addText('Let’s run your scenario live', {
    x: 0.6,
    y: 1.5,
    w: 8.8,
    h: 0.9,
    fontSize: 36,
    bold: true,
    color: C.white,
    fontFace: 'Georgia',
    align: 'center',
  })
  s.addText('Book a demo · Start a Free Trial · Plan your go-live', {
    x: 0.6,
    y: 2.55,
    w: 8.8,
    h: 0.5,
    fontSize: 15,
    color: C.caramelPale,
    align: 'center',
    fontFace: 'Segoe UI',
  })
  ;[
    { n: '1', t: 'Discovery', d: 'Your workflows & partners' },
    { n: '2', t: 'Demo', d: 'Restaurant, supplier, or both' },
    { n: '3', t: 'Go-live', d: 'Trial, training, success' },
  ].forEach((step, i) => {
    const x = 1.2 + i * 2.7
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 3.35,
      w: 2.3,
      h: 1.35,
      fill: { color: C.caramelMid, transparency: 30 },
      line: { color: C.white, transparency: 50 },
      rectRadius: 0.1,
    })
    s.addText(step.n, {
      x,
      y: 3.45,
      w: 2.3,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: C.white,
      align: 'center',
      fontFace: 'Georgia',
    })
    s.addText(step.t, {
      x,
      y: 3.85,
      w: 2.3,
      h: 0.35,
      fontSize: 12,
      bold: true,
      color: C.white,
      align: 'center',
      fontFace: 'Segoe UI',
    })
    s.addText(step.d, {
      x: x + 0.1,
      y: 4.2,
      w: 2.1,
      h: 0.4,
      fontSize: 9,
      color: C.caramelPale,
      align: 'center',
      fontFace: 'Segoe UI',
    })
  })
  s.addNotes(
    n({
      say: 'What would be most valuable — seeing ordering from the restaurant side, fulfillment from the supplier side, or both?',
      message: 'Close with a specific next meeting date, not “we’ll be in touch.”',
    })
  )
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Supplify'
  pptx.title = 'Supplify — Customer Presentation'
  pptx.subject = 'Restaurant & F&B supplier platform'

  slideCover(pptx)

  slideQuote(
    pptx,
    'From catalog to cash — one reliable flow for restaurants and their suppliers.',
    'The Supplify promise'
  )

  slideBullets(pptx, {
    title: 'The problem you know too well',
    bullets: [
      'Orders scattered across phone, text, and email',
      'No shared view of delivery status',
      'Receiving rushed — disputes discovered too late',
      'Invoices that don’t match what arrived',
      'A different process for every supplier',
    ],
    notes: n({
      say: 'Ask: How do you place orders today? How do you resolve shortages?',
      value: 'Pain they recognize = openness to a unified platform.',
      next: 'Who Supplify connects.',
    }),
  })

  slideSection(pptx, 'One platform', 'Restaurants · Suppliers · Drivers · Finance')

  slideBeforeAfter(pptx)

  slidePillars(pptx, [
    { title: 'Restaurants', body: 'Order from every supplier, track delivery, receive fairly, pay with clarity.' },
    { title: 'Suppliers', body: 'One inbox for orders, fulfillment tools, growth, and receivables.' },
    { title: 'Operations', body: 'Warehouses, dispatch, drivers, proof of delivery — built for F&B.' },
    { title: 'Trust', body: 'Roles, permissions, audit trail — everyone sees what they need.' },
  ])

  slideBullets(pptx, {
    title: 'Restaurants — purchase to payment',
    bullets: [
      'Multi-supplier catalog & cart in one session',
      'Quick lists & scheduled reorders',
      'Live status & optional GPS tracking',
      'Receiving with quality notes at the door',
      'Inventory, expiry, invoices — connected',
    ],
    diagram:
      'RESTAURANT\n  Browse → Cart\n  Track → Receive\n  Inventory → Pay\n\nOne workspace\nOne audit trail',
    notes: n({
      say: 'Position as replacing the buyer’s patchwork of calls and spreadsheets.',
      next: 'Supplier value.',
    }),
  })

  slideBullets(pptx, {
    title: 'Suppliers — never miss an order',
    bullets: [
      'Central order inbox — accept, decline, amend',
      'Catalog, deals & public mini-store',
      'Dispatch board, routes & drivers',
      'Proof of delivery & GPS',
      'Invoices from fulfilled orders',
    ],
    diagram:
      'SUPPLIER\n  Catalog → Inbox\n  Pick → Dispatch\n  Deliver → Invoice\n\nGrow customers\nGet paid faster',
    notes: n({
      value: 'Suppliers reduce missed orders and billing disputes.',
    }),
  })

  slideTimeline(pptx)

  slideDayInLife(pptx)

  slideBullets(pptx, {
    title: 'When things go wrong — stay on the record',
    bullets: [
      'Order amendments before delivery',
      'Substitutions both sides can accept',
      'Receiving disputes with evidence',
      'Credit notes applied to invoices',
      'Full history — no email archaeology',
    ],
    notes: n({
      q: 'How do you handle shortages today?',
      a: 'On Supplify it’s structured: amend, substitute, or dispute — always attached to the order.',
    }),
  })

  slideBullets(pptx, {
    title: 'Beyond ordering — run the operation',
    bullets: [
      'Promotions & deals both sides can use',
      'Reservations & guest booking (restaurants)',
      'Staff scheduling & self-service portal',
      'Reports & insights as you scale',
      'Optional consumer ordering & loyalty',
    ],
    notes: n({ say: 'Supplify is broader than procurement — F&B operations in one place.' }),
  })

  slidePlans(pptx)

  slideBullets(pptx, {
    title: 'Security & trust',
    bullets: [
      'Secure sign-in for every user',
      'Isolated workspace per organization',
      'Role-based access — owner to driver',
      'Complete audit trail on orders & finance',
      'Enterprise-grade cloud hosting',
    ],
    notes: n({
      q: 'Is our data separated from other customers?',
      a: 'Yes — tenant isolation is fundamental to the architecture.',
    }),
  })

  slideBullets(pptx, {
    title: 'Go live in weeks',
    bullets: [
      'Week 1 — Account, profile, team',
      'Week 2 — Connect partners, test order',
      'Week 3 — Production orders & invoicing',
      'Onboarding checklists & training included',
      'Dedicated success contact',
    ],
    notes: n({ say: 'Most teams are productive in two to three weeks.' }),
  })

  slideBullets(pptx, {
    title: 'Why teams choose Supplify',
    bullets: [
      'One platform — fewer tools, less double-entry',
      'Shared truth — same order status both sides',
      'Built for F&B — not generic ERP',
      'Scales from one location to many',
      'Fair dispute resolution with context',
    ],
  })

  slideCta(pptx)

  await pptx.writeFile({ fileName: OUT })
  const stat = fs.statSync(OUT)
  console.log(`Wrote ${OUT} (${(stat.size / 1024).toFixed(0)} KB)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
