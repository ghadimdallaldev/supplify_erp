#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pptxgen from 'pptxgenjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '7addak_Stakeholder_Presentation.pptx')
const NOTES = path.join(ROOT, '7addak_PRESENTATION_NOTES.md')

const pptx = new pptxgen()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = '7addak'
pptx.company = '7addak'
pptx.subject = 'Stakeholder business overview'
pptx.title = '7addak — One button between a home problem and a trusted professional'
pptx.lang = 'en-US'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }
pptx.defineSlideMaster({
  title: 'LIGHT',
  background: { color: 'F8FAFC' },
  objects: [],
  slideNumber: { x: 12.45, y: 7.08, w: 0.32, h: 0.16, fontFace: 'Aptos', fontSize: 7.5, color: '64748B', align: 'right', margin: 0 },
})
pptx.defineSlideMaster({
  title: 'DARK',
  background: { color: '0F172A' },
  objects: [],
  slideNumber: { x: 12.45, y: 7.08, w: 0.32, h: 0.16, fontFace: 'Aptos', fontSize: 7.5, color: '94A3B8', align: 'right', margin: 0 },
})

const C = {
  navy: '0F172A', navy2: '172238', navy3: '22304A', teal: '0F766E', teal2: '0D9488', tealPale: 'CCFBF1',
  amber: 'F59E0B', amberPale: 'FEF3C7', off: 'F8FAFC', white: 'FFFFFF', ink: '111827', muted: '64748B',
  border: 'E2E8F0', slate: '334155', slate2: '94A3B8', success: '16A34A', successPale: 'DCFCE7',
  warning: 'D97706', error: 'DC2626', errorPale: 'FEE2E2',
}
const FONT = 'Aptos'
const DISPLAY = 'Aptos Display'
const notes = []

function addText(slide, value, x, y, w, h, options = {}) {
  slide.addText(value, {
    x, y, w, h, fontFace: FONT, fontSize: 13, color: C.ink, margin: 0,
    valign: 'mid', breakLine: false, fit: 'shrink', ...options,
  })
}

function shape(slide, type, x, y, w, h, fill, line = fill, options = {}) {
  const x2 = x + w
  const y2 = y + h
  slide.addShape(type, {
    x: Math.min(x, x2), y: Math.min(y, y2), w: Math.abs(w) || 0.001, h: Math.abs(h) || 0.001,
    fill: { color: fill }, line: { color: line, width: line === fill ? 0 : 1 },
    flipH: w < 0, flipV: h < 0, ...options,
  })
}

function rect(slide, x, y, w, h, fill, line = fill, radius = false, options = {}) {
  shape(slide, radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, x, y, w, h, fill, line, options)
}

function circle(slide, x, y, d, fill, line = fill, options = {}) {
  shape(slide, pptx.ShapeType.ellipse, x, y, d, d, fill, line, options)
}

function connector(slide, x1, y1, x2, y2, color = C.border, width = 1.4, arrow = false, dash = 'solid') {
  const line = { color, width, dash }
  if (arrow) line.endArrowType = 'triangle'
  shape(slide, pptx.ShapeType.line, x1, y1, x2 - x1, y2 - y1, C.white, color, { fill: { color: C.white, transparency: 100 }, line })
}

function rule(slide, x, y, w, color = C.border, width = 1) {
  connector(slide, x, y, x + w, y, color, width)
}

function softShadow(color = C.navy) {
  return { type: 'outer', color, blur: 6, offset: 2, angle: 45, opacity: 0.12 }
}

function pill(slide, value, x, y, w, fill = C.tealPale, color = C.teal, options = {}) {
  rect(slide, x, y, w, 0.34, fill, fill, true)
  addText(slide, value, x + 0.08, y + 0.02, w - 0.16, 0.28, {
    fontSize: 8.2, bold: true, color, align: 'center', charSpacing: 0.7, ...options,
  })
}

function sectionLabel(slide, value, x = 0.67, y = 0.42, dark = false) {
  circle(slide, x, y + 0.01, 0.14, C.amber)
  addText(slide, value.toUpperCase(), x + 0.25, y, 4.6, 0.2, {
    fontSize: 8, bold: true, color: dark ? 'CBD5E1' : C.teal, charSpacing: 1.5,
  })
}

function heading(slide, title, subtitle, dark = false) {
  addText(slide, title, 0.65, 0.72, 12, 0.68, {
    fontFace: DISPLAY, fontSize: 27, bold: true, color: dark ? C.white : C.navy, valign: 'top',
  })
  if (subtitle) {
    addText(slide, subtitle, 0.67, 1.43, 11.75, 0.45, {
      fontSize: 12.2, color: dark ? 'CBD5E1' : C.muted, valign: 'top',
    })
  }
}

function footer(slide, dark = false) {
  addText(slide, '7ADDAK  /  STAKEHOLDER OVERVIEW', 0.66, 7.08, 4, 0.16, {
    fontSize: 7.1, bold: true, color: dark ? '64748B' : C.slate2, charSpacing: 1.1,
  })
}

function newSlide({ dark = false, label, title, subtitle = '' }) {
  const slide = pptx.addSlide(dark ? 'DARK' : 'LIGHT')
  sectionLabel(slide, label, 0.67, 0.4, dark)
  heading(slide, title, subtitle, dark)
  footer(slide, dark)
  return slide
}

function addNote(slide, title, emphasize, transition) {
  slide.addNotes(`EMPHASIZE: ${emphasize}\n\nTRANSITION: ${transition}`)
  notes.push({ title, emphasize, transition })
}

function checkMark(slide, x, y, d = 0.26, fill = C.teal) {
  circle(slide, x, y, d, fill)
  addText(slide, '✓', x, y - 0.01, d, d, { fontFace: 'Segoe UI Symbol', fontSize: d * 26, bold: true, color: C.white, align: 'center' })
}

function numberDot(slide, value, x, y, d = 0.34, fill = C.teal) {
  circle(slide, x, y, d, fill)
  addText(slide, String(value), x, y, d, d, { fontSize: 8.5, bold: true, color: C.white, align: 'center' })
}

function lineIcon(slide, kind, x, y, s = 0.5, color = C.teal) {
  const lw = 1.6
  if (kind === 'home') {
    connector(slide, x, y + s * 0.46, x + s * 0.5, y, color, lw)
    connector(slide, x + s * 0.5, y, x + s, y + s * 0.46, color, lw)
    rect(slide, x + s * 0.16, y + s * 0.42, s * 0.68, s * 0.52, C.white, color, false, { fill: { color: C.white, transparency: 100 }, line: { color, width: lw } })
    rect(slide, x + s * 0.45, y + s * 0.65, s * 0.18, s * 0.29, C.white, color, false, { fill: { color: C.white, transparency: 100 }, line: { color, width: lw } })
  } else if (kind === 'pin') {
    circle(slide, x + s * 0.17, y, s * 0.66, C.white, color, { fill: { color: C.white, transparency: 100 }, line: { color, width: lw } })
    circle(slide, x + s * 0.39, y + s * 0.22, s * 0.22, color)
    shape(slide, pptx.ShapeType.triangle, x + s * 0.31, y + s * 0.5, s * 0.38, s * 0.43, color, color, { rotate: 180 })
  } else if (kind === 'clock') {
    circle(slide, x, y, s, C.white, color, { fill: { color: C.white, transparency: 100 }, line: { color, width: lw } })
    connector(slide, x + s * 0.5, y + s * 0.22, x + s * 0.5, y + s * 0.52, color, lw)
    connector(slide, x + s * 0.5, y + s * 0.52, x + s * 0.71, y + s * 0.65, color, lw)
  } else if (kind === 'shield') {
    shape(slide, pptx.ShapeType.pentagon, x, y, s, s * 0.92, C.white, color, { fill: { color: C.white, transparency: 100 }, line: { color, width: lw }, rotate: 180 })
    addText(slide, '✓', x + s * 0.2, y + s * 0.17, s * 0.6, s * 0.52, { fontFace: 'Segoe UI Symbol', fontSize: s * 22, bold: true, color, align: 'center' })
  } else if (kind === 'star') {
    shape(slide, pptx.ShapeType.star5, x, y, s, s, color, color)
  } else if (kind === 'person') {
    circle(slide, x + s * 0.32, y, s * 0.36, color)
    shape(slide, pptx.ShapeType.arc, x + s * 0.12, y + s * 0.4, s * 0.76, s * 0.55, C.white, color, { fill: { color: C.white, transparency: 100 }, line: { color, width: lw } })
  }
}

// 01 — The Big Idea
{
  const s = pptx.addSlide('DARK')
  circle(s, 9.5, -2.55, 7.2, C.teal, C.teal, { fill: { color: C.teal, transparency: 24 }, line: { color: C.teal, transparency: 100 } })
  circle(s, 11.25, 5.38, 2.8, C.amber, C.amber, { fill: { color: C.amber, transparency: 38 }, line: { color: C.amber, transparency: 100 } })
  circle(s, -1.8, 5.85, 2.8, C.teal2, C.teal2, { fill: { color: C.teal2, transparency: 42 }, line: { color: C.teal2, transparency: 100 } })
  shape(s, pptx.ShapeType.hexagon, 0.68, 0.5, 0.56, 0.56, C.teal, C.teal)
  addText(s, '7', 0.68, 0.49, 0.56, 0.56, { fontFace: DISPLAY, fontSize: 20, bold: true, color: C.white, align: 'center' })
  addText(s, '7addak', 1.38, 0.52, 2.2, 0.42, { fontFace: DISPLAY, fontSize: 19, bold: true, color: C.white, charSpacing: 0.2 })
  pill(s, 'STAKEHOLDER OVERVIEW', 10.47, 0.58, 2.18, C.navy3, 'CBD5E1')

  addText(s, 'One button between a\nhome problem and a\ntrusted professional.', 0.74, 1.52, 7.35, 2.35, {
    fontFace: DISPLAY, fontSize: 34, bold: true, color: C.white, valign: 'top', breakLine: true,
  })
  addText(s, 'A managed home-maintenance marketplace built around one outcome: less uncertainty, faster resolution, and service people can trust.', 0.76, 4.1, 6.55, 0.76, {
    fontSize: 14.4, color: 'CBD5E1', valign: 'top', breakLine: true,
  })
  pill(s, 'MECHANICAL', 0.76, 5.18, 1.37, C.navy3, 'CBD5E1')
  pill(s, 'ELECTRICAL', 2.25, 5.18, 1.37, C.navy3, 'CBD5E1')
  pill(s, 'PLUMBING', 3.74, 5.18, 1.22, C.navy3, 'CBD5E1')
  pill(s, 'CIVIL', 5.08, 5.18, 0.86, C.navy3, 'CBD5E1')

  const nodes = [
    { x: 8.12, y: 2.0, d: 1.05, fill: C.error, mark: '!', label: 'PROBLEM', sub: 'Describe what is wrong' },
    { x: 9.72, y: 3.28, d: 1.2, fill: C.teal, mark: '7', label: 'TECHNICIAN', sub: 'Matched and managed' },
    { x: 11.4, y: 1.83, d: 1.05, fill: C.success, mark: '✓', label: 'FIXED', sub: 'Resolution, support, trust' },
  ]
  connector(s, 8.94, 2.78, 10.0, 3.49, '5EEAD4', 2.1, true)
  connector(s, 10.79, 3.42, 11.64, 2.72, '5EEAD4', 2.1, true)
  nodes.forEach((n) => {
    circle(s, n.x, n.y, n.d, n.fill, n.fill, { shadow: softShadow('020617') })
    addText(s, n.mark, n.x, n.y - 0.02, n.d, n.d, { fontFace: n.mark === '✓' ? 'Segoe UI Symbol' : DISPLAY, fontSize: 25, bold: true, color: C.white, align: 'center' })
    addText(s, n.label, n.x - 0.27, n.y + n.d + 0.2, n.d + 0.54, 0.22, { fontSize: 8.3, bold: true, color: C.white, align: 'center', charSpacing: 1 })
    addText(s, n.sub, n.x - 0.42, n.y + n.d + 0.5, n.d + 0.84, 0.44, { fontSize: 9, color: '94A3B8', align: 'center', valign: 'top' })
  })
  addText(s, 'PROBLEM  →  TECHNICIAN  →  FIXED', 8.1, 5.62, 4.53, 0.38, { fontSize: 11.5, bold: true, color: '99F6E4', align: 'center', charSpacing: 0.7 })
  footer(s, true)
  addNote(s, 'The Big Idea', '7addak compresses a fragmented home-maintenance search into one trusted, managed journey.', 'First, show why the current experience is broken.')
}

// 02 — The Problem
{
  const s = newSlide({ label: '01 / THE PROBLEM', title: 'Home maintenance starts with uncertainty.', subtitle: 'When something breaks, customers become coordinators—searching, calling, negotiating, and hoping.' })
  rect(s, 0.65, 2.05, 12.03, 1.55, C.white, C.border, true, { shadow: softShadow() })
  addText(s, 'TRADITIONAL', 0.92, 2.28, 1.22, 0.24, { fontSize: 8.5, bold: true, color: C.error, charSpacing: 1.3 })
  const oldSteps = ['SEARCH', 'CALL', 'NEGOTIATE', 'WAIT', 'HOPE']
  oldSteps.forEach((label, i) => {
    const x = 2.25 + i * 1.82
    if (i < oldSteps.length - 1) connector(s, x + 0.72, 2.83, x + 1.72, 2.83, 'CBD5E1', 1.5, true, 'dash')
    circle(s, x, 2.55, 0.56, i === 4 ? C.errorPale : 'F1F5F9', i === 4 ? C.errorPale : 'F1F5F9')
    addText(s, String(i + 1), x, 2.55, 0.56, 0.56, { fontSize: 9, bold: true, color: i === 4 ? C.error : C.slate, align: 'center' })
    addText(s, label, x - 0.23, 3.15, 1.02, 0.2, { fontSize: 8.2, bold: true, color: C.slate, align: 'center', charSpacing: 0.6 })
  })

  rect(s, 0.65, 3.84, 12.03, 1.55, C.navy, C.navy, true, { shadow: softShadow() })
  addText(s, 'WITH 7ADDAK', 0.92, 4.08, 1.32, 0.24, { fontSize: 8.5, bold: true, color: '5EEAD4', charSpacing: 1.3 })
  const newSteps = ['REQUEST', 'MATCH', 'TRACK', 'FIX', 'PAY']
  newSteps.forEach((label, i) => {
    const x = 2.25 + i * 1.82
    if (i < newSteps.length - 1) connector(s, x + 0.72, 4.62, x + 1.72, 4.62, '5EEAD4', 2, true)
    circle(s, x, 4.34, 0.56, i === 3 ? C.success : C.teal, i === 3 ? C.success : C.teal)
    addText(s, i === 3 ? '✓' : String(i + 1), x, 4.34, 0.56, 0.56, { fontFace: i === 3 ? 'Segoe UI Symbol' : FONT, fontSize: 9.5, bold: true, color: C.white, align: 'center' })
    addText(s, label, x - 0.23, 4.94, 1.02, 0.2, { fontSize: 8.2, bold: true, color: C.white, align: 'center', charSpacing: 0.6 })
  })

  const burdens = [
    ['FRICTION', 'Multiple calls, uncertain availability, and endless coordination.'],
    ['PRICE ANXIETY', 'Unclear scope and informal negotiation create doubt before work begins.'],
    ['TRUST RISK', 'Unknown quality, inconsistent service, and little recourse if things go wrong.'],
  ]
  burdens.forEach(([title, body], i) => {
    const x = 0.66 + i * 4.07
    rect(s, x, 5.68, 3.79, 1.05, i === 2 ? C.errorPale : C.white, i === 2 ? C.errorPale : C.border, false)
    addText(s, title, x + 0.22, 5.9, 1.18, 0.2, { fontSize: 8.3, bold: true, color: i === 2 ? C.error : C.teal, charSpacing: 1 })
    addText(s, body, x + 1.47, 5.83, 2.05, 0.56, { fontSize: 9.4, color: C.slate, valign: 'top' })
  })
  addNote(s, 'The Problem', 'The pain is not only the repair—it is the unmanaged search, price uncertainty, and trust gap around it.', '7addak replaces that burden with a guided experience.')
}

// 03 — The Solution
{
  const s = newSlide({ label: '02 / THE SOLUTION', title: 'From “what’s happening?” to handled.', subtitle: 'Customers describe symptoms in plain language. 7addak orchestrates everything that follows.' })

  rect(s, 0.67, 2.0, 3.42, 4.62, C.navy, C.navy, true, { shadow: softShadow() })
  addText(s, 'WHAT’S HAPPENING?', 0.98, 2.34, 2.55, 0.22, { fontSize: 8.3, bold: true, color: '5EEAD4', charSpacing: 1.1 })
  addText(s, 'Tell us what you see.', 0.98, 2.68, 2.56, 0.45, { fontFace: DISPLAY, fontSize: 19, bold: true, color: C.white })
  const symptoms = ['Water leaking', 'No water pressure', 'Toilet problem', 'No hot water', 'Something else']
  symptoms.forEach((symptom, i) => {
    const y = 3.38 + i * 0.49
    rect(s, 0.97, y, 2.78, 0.36, i === 0 ? C.teal : C.navy3, i === 0 ? C.teal : C.navy3, true)
    addText(s, symptom, 1.13, y + 0.02, 2.14, 0.3, { fontSize: 9.2, color: C.white })
    if (i === 0) addText(s, '✓', 3.33, y + 0.02, 0.23, 0.3, { fontFace: 'Segoe UI Symbol', fontSize: 9, bold: true, color: C.white, align: 'center' })
  })
  rule(s, 0.98, 5.98, 2.76, '334155')
  rect(s, 0.98, 6.17, 1.26, 0.34, C.amber, C.amber, true)
  addText(s, 'HELP NOW', 0.98, 6.19, 1.26, 0.29, { fontSize: 8, bold: true, color: C.navy, align: 'center', charSpacing: 0.6 })
  rect(s, 2.36, 6.17, 1.39, 0.34, C.navy3, '475569', true)
  addText(s, 'SCHEDULE', 2.36, 6.19, 1.39, 0.29, { fontSize: 8, bold: true, color: C.white, align: 'center', charSpacing: 0.6 })

  const phases = [
    { x: 4.45, w: 2.55, title: 'DESCRIBE', tone: C.teal, items: ['Tell us what’s wrong', 'Answer simple questions', 'Now or schedule', 'Confirm location'] },
    { x: 7.17, w: 2.55, title: 'CONNECT', tone: C.amber, items: ['Eligible technician', 'Match confirmed', 'ETA & tracking'] },
    { x: 9.89, w: 2.78, title: 'RESOLVE', tone: C.success, items: ['Diagnose / quote', 'Approve', 'Complete', 'Pay & rate'] },
  ]
  phases.forEach((phase, p) => {
    rect(s, phase.x, 2.0, phase.w, 4.62, C.white, C.border, false)
    rect(s, phase.x, 2.0, phase.w, 0.08, phase.tone, phase.tone)
    addText(s, `0${p + 1}`, phase.x + 0.2, 2.28, 0.42, 0.23, { fontSize: 8.5, bold: true, color: phase.tone })
    addText(s, phase.title, phase.x + 0.67, 2.27, phase.w - 0.88, 0.24, { fontSize: 9, bold: true, color: C.navy, charSpacing: 1 })
    phase.items.forEach((item, i) => {
      const y = 2.92 + i * 0.73
      numberDot(s, i + 1, phase.x + 0.22, y, 0.32, p === 1 && i === 0 ? C.amber : phase.tone)
      addText(s, item, phase.x + 0.7, y - 0.01, phase.w - 0.91, 0.34, { fontSize: 10.1, bold: i === phase.items.length - 1, color: C.slate })
      if (i < phase.items.length - 1) connector(s, phase.x + 0.38, y + 0.34, phase.x + 0.38, y + 0.64, C.border, 1.2)
    })
  })
  connector(s, 6.99, 4.25, 7.13, 4.25, C.teal, 2, true)
  connector(s, 9.71, 4.25, 9.85, 4.25, C.teal, 2, true)
  addText(s, 'NO TECHNICAL KNOWLEDGE REQUIRED', 6.78, 6.75, 4.55, 0.22, { fontSize: 8.6, bold: true, color: C.teal, align: 'center', charSpacing: 1.2 })
  addNote(s, 'The Solution', 'The interface begins with the customer’s symptom—not trade terminology—and carries the job through resolution.', 'That experience creates value on both sides of the marketplace.')
}

// 04 — Value for Customers & Technicians
{
  const s = newSlide({ label: '03 / TWO-SIDED VALUE', title: 'Better for the home. Better for the professional.', subtitle: '7addak removes coordination friction for customers and demand-generation friction for technicians.' })

  rect(s, 0.66, 2.05, 5.64, 4.68, C.white, C.border, false, { shadow: softShadow() })
  rect(s, 7.03, 2.05, 5.64, 4.68, C.navy, C.navy, false, { shadow: softShadow() })
  circle(s, 6.06, 3.8, 1.2, C.amber, C.off)
  addText(s, '7', 6.06, 3.78, 1.2, 1.2, { fontFace: DISPLAY, fontSize: 30, bold: true, color: C.navy, align: 'center' })
  connector(s, 5.62, 4.4, 6.04, 4.4, C.teal, 2, true)
  connector(s, 7.26, 4.4, 6.84, 4.4, C.teal, 2, true)

  lineIcon(s, 'home', 0.99, 2.36, 0.52, C.teal)
  addText(s, 'FOR CUSTOMERS', 1.72, 2.37, 2.0, 0.24, { fontSize: 9, bold: true, color: C.teal, charSpacing: 1.2 })
  addText(s, 'Confidence without the chase.', 0.99, 2.83, 4.6, 0.38, { fontFace: DISPLAY, fontSize: 18, bold: true, color: C.navy })
  const customerGroups = [
    ['EASY', 'One request, simple questions, visible ETA'],
    ['CLEAR', 'Structured pricing and transparent quotations'],
    ['SUPPORTED', 'Ratings, service history, support, warranty potential'],
  ]
  customerGroups.forEach(([title, body], i) => {
    const y = 3.55 + i * 0.86
    checkMark(s, 1.0, y, 0.28, C.teal)
    addText(s, title, 1.44, y - 0.01, 1.05, 0.22, { fontSize: 8.4, bold: true, color: C.navy, charSpacing: 0.8 })
    addText(s, body, 2.43, y - 0.06, 3.25, 0.48, { fontSize: 9.5, color: C.slate, valign: 'top' })
  })
  pill(s, 'LESS SEARCHING  •  MORE CERTAINTY', 1.0, 6.12, 4.75, C.tealPale, C.teal)

  lineIcon(s, 'person', 7.37, 2.36, 0.52, '5EEAD4')
  addText(s, 'FOR TECHNICIANS', 8.1, 2.37, 2.1, 0.24, { fontSize: 9, bold: true, color: '5EEAD4', charSpacing: 1.2 })
  addText(s, 'More time doing skilled work.', 7.37, 2.83, 4.55, 0.38, { fontFace: DISPLAY, fontSize: 18, bold: true, color: C.white })
  const technicianGroups = [
    ['DEMAND', 'Structured jobs and less time finding customers'],
    ['TOOLS', 'Navigation, quotations, job flow, earnings visibility'],
    ['REPUTATION', 'Ratings, repeat demand, and a trusted service record'],
  ]
  technicianGroups.forEach(([title, body], i) => {
    const y = 3.55 + i * 0.86
    checkMark(s, 7.38, y, 0.28, C.teal2)
    addText(s, title, 7.82, y - 0.01, 1.18, 0.22, { fontSize: 8.4, bold: true, color: C.white, charSpacing: 0.8 })
    addText(s, body, 8.98, y - 0.06, 3.18, 0.48, { fontSize: 9.5, color: 'CBD5E1', valign: 'top' })
  })
  pill(s, 'LESS PROSPECTING  •  MORE PRODUCTIVE TIME', 7.38, 6.12, 4.74, C.navy3, '99F6E4')
  addNote(s, 'Value for Customers & Technicians', '7addak wins only when both sides experience less friction and more productive outcomes.', 'The mechanism that makes that possible is trust.')
}

// 05 — Trust Is the Product
{
  const s = newSlide({ dark: true, label: '04 / THE TRUST MODEL', title: 'Trust is not a feature. It is the product.', subtitle: '7addak is a managed marketplace—not an open directory of names and phone numbers.' })
  addText(s, '“7addak is selling trust,\nnot plumbing.”', 0.72, 2.05, 5.35, 1.55, { fontFace: DISPLAY, fontSize: 30, bold: true, color: C.white, valign: 'top' })
  rect(s, 0.74, 4.02, 5.03, 1.24, C.navy3, C.navy3, false)
  addText(s, 'OPEN DIRECTORY', 1.0, 4.28, 1.57, 0.22, { fontSize: 8.3, bold: true, color: C.slate2, charSpacing: 1 })
  addText(s, 'A list of options', 1.0, 4.62, 1.8, 0.29, { fontSize: 12.5, color: 'CBD5E1' })
  addText(s, '≠', 2.94, 4.35, 0.42, 0.48, { fontSize: 23, bold: true, color: C.amber, align: 'center' })
  addText(s, '7ADDAK', 3.62, 4.28, 1.25, 0.22, { fontSize: 8.3, bold: true, color: '5EEAD4', charSpacing: 1 })
  addText(s, 'An accountable experience', 3.62, 4.62, 1.89, 0.35, { fontSize: 12.5, bold: true, color: C.white })
  addText(s, 'Review. Match. Monitor. Support.', 0.77, 5.62, 4.9, 0.28, { fontSize: 11.5, bold: true, color: '99F6E4', charSpacing: 0.2 })
  addText(s, 'Every layer reduces uncertainty before, during, and after the visit.', 0.77, 6.03, 4.9, 0.48, { fontSize: 10.5, color: C.slate2, valign: 'top' })

  const trust = [
    ['01', 'VERIFIED IDENTITY', 'Know who is arriving.'],
    ['02', 'SKILLS', 'Match the right trade to the problem.'],
    ['03', 'EXPERIENCE', 'Review practical capability and background.'],
    ['04', 'RATINGS', 'Turn each outcome into visible reputation.'],
    ['05', 'JOB HISTORY', 'Build an operating record over time.'],
    ['06', 'PLATFORM OVERSIGHT', 'Support, complaints, and quality control.'],
  ]
  connector(s, 7.02, 2.23, 7.02, 6.27, '475569', 2)
  trust.forEach(([num, title, body], i) => {
    const y = 2.08 + i * 0.72
    circle(s, 6.81, y, 0.42, i === 5 ? C.amber : C.teal, i === 5 ? C.amber : C.teal)
    addText(s, num, 6.81, y, 0.42, 0.42, { fontSize: 7.4, bold: true, color: i === 5 ? C.navy : C.white, align: 'center' })
    addText(s, title, 7.52, y - 0.01, 2.3, 0.2, { fontSize: 8.8, bold: true, color: C.white, charSpacing: 0.75 })
    addText(s, body, 9.87, y - 0.03, 2.53, 0.28, { fontSize: 9.4, color: 'CBD5E1' })
  })
  addNote(s, 'Trust Is the Product', 'Verification, eligibility, reputation, and platform oversight turn a directory into a managed service promise.', 'That trust must extend to pricing, especially when the repair is uncertain.')
}

// 06 — Pricing Without Surprises
{
  const s = newSlide({ label: '05 / PRICING', title: 'Clarity before commitment.', subtitle: 'Use the right pricing model for the job—without asking the customer to gamble on an unknown total.' })
  rect(s, 0.66, 2.03, 4.5, 4.54, C.navy, C.navy, false, { shadow: softShadow() })
  pill(s, 'FIXED PRICE', 0.98, 2.35, 1.42, C.teal, C.white)
  addText(s, 'Known service.\nKnown price.', 0.98, 2.92, 3.35, 0.98, { fontFace: DISPLAY, fontSize: 23, bold: true, color: C.white, valign: 'top' })
  addText(s, 'For predictable work such as installation or routine maintenance.', 0.99, 4.07, 3.42, 0.63, { fontSize: 11.2, color: 'CBD5E1', valign: 'top' })
  rect(s, 0.99, 5.02, 3.75, 0.86, C.navy3, C.navy3, true)
  addText(s, 'PRICE SHOWN BEFORE BOOKING', 1.24, 5.18, 2.57, 0.2, { fontSize: 8.2, bold: true, color: '5EEAD4', charSpacing: 0.9 })
  checkMark(s, 4.15, 5.2, 0.32, C.success)
  addText(s, 'Confidence comes from knowing the commitment upfront.', 0.99, 6.08, 3.72, 0.32, { fontSize: 9.7, color: C.slate2 })

  rect(s, 5.46, 2.03, 7.22, 4.54, C.white, C.border, false, { shadow: softShadow() })
  pill(s, 'DIAGNOSIS + QUOTATION', 5.79, 2.35, 2.38, C.amberPale, C.warning)
  addText(s, 'Unknown repair. Transparent decision.', 5.79, 2.91, 6.34, 0.38, { fontFace: DISPLAY, fontSize: 19, bold: true, color: C.navy })
  const quoteSteps = [
    ['1', 'DIAGNOSE', 'Technician inspects'],
    ['2', 'ITEMIZE', 'Labor + materials'],
    ['3', 'CONFIRM', 'Customer sees total'],
  ]
  quoteSteps.forEach(([n, title, sub], i) => {
    const x = 5.8 + i * 1.94
    if (i < 2) connector(s, x + 1.5, 3.97, x + 1.86, 3.97, C.border, 1.6, true)
    circle(s, x, 3.67, 0.58, i === 2 ? C.amber : C.teal, i === 2 ? C.amber : C.teal)
    addText(s, n, x, 3.67, 0.58, 0.58, { fontSize: 10, bold: true, color: i === 2 ? C.navy : C.white, align: 'center' })
    addText(s, title, x + 0.72, 3.64, 1.12, 0.2, { fontSize: 8.2, bold: true, color: C.navy, charSpacing: 0.65 })
    addText(s, sub, x + 0.72, 3.94, 1.12, 0.42, { fontSize: 8.9, color: C.muted, valign: 'top' })
  })
  rect(s, 5.8, 4.67, 3.68, 1.41, C.off, C.border, false)
  addText(s, 'ITEMIZED QUOTE', 6.05, 4.88, 1.5, 0.2, { fontSize: 8, bold: true, color: C.teal, charSpacing: 0.9 })
  addText(s, 'Labor\nMaterials\nTotal', 6.05, 5.18, 1.34, 0.65, { fontSize: 9.2, color: C.slate, breakLine: true, valign: 'top' })
  addText(s, 'Clearly stated\nClearly stated\nConfirmed total', 7.54, 5.18, 1.62, 0.65, { fontSize: 9.2, bold: true, color: C.navy, align: 'right', breakLine: true, valign: 'top' })
  rect(s, 9.73, 4.67, 2.62, 0.59, C.success, C.success, true)
  addText(s, 'APPROVE', 9.73, 4.71, 2.62, 0.5, { fontSize: 9, bold: true, color: C.white, align: 'center', charSpacing: 0.8 })
  rect(s, 9.73, 5.49, 2.62, 0.59, C.white, C.border, true)
  addText(s, 'DECLINE', 9.73, 5.53, 2.62, 0.5, { fontSize: 9, bold: true, color: C.muted, align: 'center', charSpacing: 0.8 })
  addText(s, 'No quote-dependent work begins before customer approval.', 6.35, 6.25, 5.5, 0.22, { fontSize: 9.4, bold: true, color: C.warning, align: 'center' })
  addNote(s, 'Pricing Without Surprises', 'Fixed price serves predictable work; diagnosis plus explicit approval serves uncertain repair work.', 'The platform has to operationalize that promise from request through support.')
}

// 07 — How 7addak Operates
{
  const s = newSlide({ dark: true, label: '06 / OPERATING MODEL', title: 'Convenience on the surface. Control underneath.', subtitle: '7addak owns the service workflow between the customer’s need and the technician’s work.' })
  const cy = 3.23
  circle(s, 1.05, cy, 1.08, C.white, C.white)
  lineIcon(s, 'home', 1.34, cy + 0.23, 0.5, C.teal)
  addText(s, 'CUSTOMER', 0.87, 4.49, 1.45, 0.22, { fontSize: 8.7, bold: true, color: C.white, align: 'center', charSpacing: 1 })
  addText(s, 'Need + location', 0.87, 4.79, 1.45, 0.23, { fontSize: 9.1, color: C.slate2, align: 'center' })
  shape(s, pptx.ShapeType.hexagon, 5.39, 2.75, 2.12, 2.12, C.teal, '5EEAD4', { line: { color: '5EEAD4', width: 1.4 }, shadow: softShadow('020617') })
  addText(s, '7', 5.39, 2.82, 2.12, 1.15, { fontFace: DISPLAY, fontSize: 43, bold: true, color: C.white, align: 'center' })
  addText(s, '7ADDAK', 5.39, 4.04, 2.12, 0.26, { fontSize: 9.2, bold: true, color: '99F6E4', align: 'center', charSpacing: 1.4 })
  circle(s, 11.18, cy, 1.08, C.white, C.white)
  lineIcon(s, 'person', 11.47, cy + 0.23, 0.5, C.teal)
  addText(s, 'TECHNICIAN', 10.99, 4.49, 1.48, 0.22, { fontSize: 8.7, bold: true, color: C.white, align: 'center', charSpacing: 1 })
  addText(s, 'Skill + availability', 10.92, 4.79, 1.64, 0.23, { fontSize: 9.1, color: C.slate2, align: 'center' })
  connector(s, 2.36, 3.78, 5.18, 3.78, '5EEAD4', 2.2, true)
  connector(s, 7.72, 3.78, 10.98, 3.78, '5EEAD4', 2.2, true)
  addText(s, 'REQUEST', 3.18, 3.41, 1.15, 0.2, { fontSize: 8, bold: true, color: C.slate2, align: 'center', charSpacing: 1 })
  addText(s, 'MATCH + MANAGE', 8.35, 3.41, 1.86, 0.2, { fontSize: 8, bold: true, color: C.slate2, align: 'center', charSpacing: 1 })

  const managed = ['MATCHING', 'QUALITY', 'PRICING RULES', 'JOB STATUS', 'QUOTATIONS', 'PAYMENTS', 'RATINGS', 'COMPLAINTS', 'WARRANTIES', 'SUPPORT']
  managed.forEach((item, i) => {
    const row = Math.floor(i / 5)
    const col = i % 5
    const x = 0.78 + col * 2.49
    const y = 5.43 + row * 0.47
    rect(s, x, y, 2.22, 0.32, C.navy3, '334155', true)
    addText(s, item, x + 0.08, y + 0.02, 2.06, 0.26, { fontSize: 7.8, bold: true, color: i === 9 ? 'FDE68A' : 'CBD5E1', align: 'center', charSpacing: 0.65 })
  })
  rule(s, 0.79, 6.57, 11.76, '334155')
  addText(s, 'Technology creates convenience. Operations create reliability.', 0.8, 6.7, 11.75, 0.27, { fontFace: DISPLAY, fontSize: 12.8, bold: true, italic: true, color: '99F6E4', align: 'center' })
  addNote(s, 'How 7addak Operates', '7addak is the accountable operating layer: it manages eligibility, matching, pricing, workflow, payment, quality, and support.', 'That operating role supports a straightforward commercial model.')
}

// 08 — Business Model
{
  const s = newSlide({ label: '07 / BUSINESS MODEL', title: 'Earn when the job is completed.', subtitle: 'The intended commercial flow aligns platform revenue with a delivered service outcome.' })
  rect(s, 0.66, 2.0, 12.01, 2.2, C.navy, C.navy, false, { shadow: softShadow() })
  const flow = [
    { x: 1.12, name: 'CUSTOMER', sub: 'Pays for the completed service', fill: C.white, fg: C.navy },
    { x: 5.45, name: '7ADDAK', sub: 'Retains the agreed platform share', fill: C.teal, fg: C.white },
    { x: 9.78, name: 'TECHNICIAN', sub: 'Receives the settled portion', fill: C.white, fg: C.navy },
  ]
  flow.forEach((n, i) => {
    circle(s, n.x, 2.46, 1.18, n.fill, n.fill)
    addText(s, i === 1 ? '7' : i === 0 ? 'HOME' : 'PRO', n.x, 2.45, 1.18, 1.18, { fontFace: DISPLAY, fontSize: i === 1 ? 27 : 10, bold: true, color: n.fg, align: 'center' })
    addText(s, n.name, n.x - 0.25, 3.77, 1.68, 0.2, { fontSize: 8.5, bold: true, color: C.white, align: 'center', charSpacing: 0.9 })
    addText(s, n.sub, n.x - 0.7, 4.02, 2.58, 0.37, { fontSize: 8.6, color: C.slate2, align: 'center', valign: 'top' })
  })
  connector(s, 2.55, 3.05, 5.25, 3.05, '5EEAD4', 2.2, true)
  connector(s, 6.88, 3.05, 9.58, 3.05, '5EEAD4', 2.2, true)
  pill(s, 'SERVICE PAYMENT', 3.2, 2.64, 1.46, C.navy3, '99F6E4')
  pill(s, 'SETTLEMENT', 7.62, 2.64, 1.34, C.navy3, '99F6E4')

  rect(s, 0.66, 4.62, 3.0, 1.82, C.tealPale, C.tealPale, false)
  addText(s, 'PRIMARY ENGINE', 0.92, 4.88, 1.65, 0.2, { fontSize: 8.3, bold: true, color: C.teal, charSpacing: 1 })
  addText(s, 'Commission or platform share on completed jobs.', 0.92, 5.25, 2.39, 0.72, { fontFace: DISPLAY, fontSize: 15.5, bold: true, color: C.navy, valign: 'top' })
  addText(s, 'No percentage assumed.', 0.92, 6.05, 2.32, 0.2, { fontSize: 8.5, color: C.muted })

  addText(s, 'FUTURE OPPORTUNITIES', 4.02, 4.76, 2.28, 0.22, { fontSize: 8.3, bold: true, color: C.warning, charSpacing: 1 })
  const future = ['Maintenance plans', 'Technician subscriptions', 'Corporate accounts', 'Preventive maintenance', 'Priority services', 'More service categories']
  future.forEach((item, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = 4.02 + col * 2.84
    const y = 5.18 + row * 0.62
    rect(s, x, y, 2.56, 0.42, C.white, C.border, false)
    circle(s, x + 0.17, y + 0.14, 0.14, C.amber)
    addText(s, item, x + 0.45, y + 0.05, 1.91, 0.31, { fontSize: 9.1, bold: true, color: C.slate })
  })
  addText(s, 'Clearly staged as future options—not launch assumptions.', 4.02, 6.53, 7.92, 0.2, { fontSize: 8.6, italic: true, color: C.muted, align: 'right' })
  addNote(s, 'Business Model', 'The primary model is a platform share on completed jobs; every other monetization route remains a future option.', 'The launch strategy must first create reliable local density.')
}

// 09 — Launch & Growth Strategy
{
  const s = newSlide({ label: '08 / LAUNCH & GROWTH', title: 'Win one zone before expanding the map.', subtitle: 'Fast response comes from density—not from launching everywhere at once.' })
  rect(s, 0.66, 2.01, 6.2, 4.69, C.white, C.border, false, { shadow: softShadow() })
  addText(s, 'CONTROLLED LAUNCH', 0.98, 2.3, 2.1, 0.22, { fontSize: 8.3, bold: true, color: C.teal, charSpacing: 1 })
  const phases = [
    ['01', 'FOCUS', 'Start with one controlled geographic area.'],
    ['02', 'DENSIFY', 'Recruit a carefully selected technician network.'],
    ['03', 'PROVE', 'Fast matching, reliability, first-time fix, satisfaction, repeat usage.'],
    ['04', 'EXPAND', 'Grow geography only after the operating model holds.'],
  ]
  phases.forEach(([n, title, body], i) => {
    const y = 2.82 + i * 0.8
    circle(s, 0.99, y, 0.46, i === 3 ? C.amber : C.teal, i === 3 ? C.amber : C.teal)
    addText(s, n, 0.99, y, 0.46, 0.46, { fontSize: 7.7, bold: true, color: i === 3 ? C.navy : C.white, align: 'center' })
    if (i < 3) connector(s, 1.22, y + 0.46, 1.22, y + 0.77, C.border, 1.6)
    addText(s, title, 1.7, y - 0.02, 1.08, 0.2, { fontSize: 8.8, bold: true, color: C.navy, charSpacing: 0.8 })
    addText(s, body, 2.75, y - 0.05, 3.65, 0.45, { fontSize: 9.6, color: C.slate, valign: 'top' })
  })
  rect(s, 0.98, 6.16, 5.56, 0.3, C.amberPale, C.amberPale, true)
  addText(s, 'DEMAND DENSITY  +  TECHNICIAN DENSITY  =  FAST RESPONSE', 1.05, 6.18, 5.42, 0.25, { fontSize: 8.4, bold: true, color: C.warning, align: 'center', charSpacing: 0.45 })

  rect(s, 7.15, 2.01, 5.53, 4.69, C.navy, C.navy, false, { shadow: softShadow() })
  addText(s, 'NORTH STAR', 7.49, 2.3, 1.35, 0.22, { fontSize: 8.3, bold: true, color: '5EEAD4', charSpacing: 1 })
  addText(s, 'TIME TO\nRESOLUTION', 7.47, 2.74, 4.42, 1.13, { fontFace: DISPLAY, fontSize: 28, bold: true, color: C.white, valign: 'top' })
  addText(s, '“I have a problem.”  →  “Problem solved.”', 7.49, 4.02, 4.6, 0.3, { fontSize: 10.6, bold: true, color: '99F6E4' })
  rule(s, 7.49, 4.54, 4.83, '334155')
  const kpis = ['Match time', 'Technician ETA', 'Acceptance rate', 'Cancellation rate', 'Average job value', 'Jobs / technician', 'Customer rating', 'Technician rating', 'Repeat customers', 'First-time fix', 'Complaint rate', 'Platform commission', 'Technician utilization']
  kpis.forEach((item, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = 7.49 + col * 1.61
    const y = 4.82 + row * 0.3
    addText(s, `• ${item}`, x, y, 1.52, 0.22, { fontSize: 7.6, color: i === 9 ? 'FDE68A' : 'CBD5E1' })
  })
  addNote(s, 'Launch & Growth Strategy', 'Start small, create local density, prove reliability, and make Time to Resolution the north-star measure.', 'The closing vision is a simpler category promise people can remember.')
}

// 10 — The Vision
{
  const s = pptx.addSlide('DARK')
  sectionLabel(s, '09 / THE VISION', 0.67, 0.42, true)
  circle(s, 10.08, -2.85, 7.0, C.teal, C.teal, { fill: { color: C.teal, transparency: 24 }, line: { color: C.teal, transparency: 100 } })
  circle(s, -1.92, 5.82, 3.1, C.amber, C.amber, { fill: { color: C.amber, transparency: 38 }, line: { color: C.amber, transparency: 100 } })
  addText(s, 'A home problem should feel\nsolvable from the first tap.', 0.7, 0.89, 9.25, 1.36, { fontFace: DISPLAY, fontSize: 31, bold: true, color: C.white, valign: 'top' })

  addText(s, 'REPLACE', 0.75, 2.61, 1.2, 0.22, { fontSize: 8.5, bold: true, color: C.slate2, charSpacing: 1.2 })
  const replace = ['SEARCHING', 'CALLING', 'NEGOTIATING', 'WAITING', 'UNCERTAINTY']
  replace.forEach((item, i) => {
    const y = 3.02 + i * 0.5
    addText(s, item, 0.76, y, 2.1, 0.26, { fontSize: 11, bold: true, color: '94A3B8', charSpacing: 0.5 })
    rule(s, 0.73, y + 0.14, 2.18, '475569', 1.4)
  })
  connector(s, 3.36, 4.08, 4.17, 4.08, C.amber, 2.4, true)
  addText(s, 'WITH', 4.61, 2.61, 0.9, 0.22, { fontSize: 8.5, bold: true, color: '5EEAD4', charSpacing: 1.2 })
  const withSteps = ['REQUEST', 'MATCH', 'TRACK', 'APPROVE', 'FIX']
  withSteps.forEach((item, i) => {
    const y = 3.02 + i * 0.5
    circle(s, 4.62, y + 0.01, 0.25, i === 4 ? C.success : C.teal, i === 4 ? C.success : C.teal)
    addText(s, i === 4 ? '✓' : String(i + 1), 4.62, y, 0.25, 0.25, { fontFace: i === 4 ? 'Segoe UI Symbol' : FONT, fontSize: 7, bold: true, color: C.white, align: 'center' })
    addText(s, item, 5.07, y, 1.45, 0.26, { fontSize: 11, bold: true, color: C.white, charSpacing: 0.5 })
  })

  shape(s, pptx.ShapeType.hexagon, 8.37, 2.32, 1.12, 1.12, C.teal, '5EEAD4', { line: { color: '5EEAD4', width: 1.2 } })
  addText(s, '7', 8.37, 2.31, 1.12, 1.12, { fontFace: DISPLAY, fontSize: 31, bold: true, color: C.white, align: 'center' })
  addText(s, '7addak', 8.35, 3.69, 3.72, 0.68, { fontFace: DISPLAY, fontSize: 34, bold: true, color: C.white })
  addText(s, 'One button between a home problem\nand a trusted professional.', 8.37, 4.51, 3.97, 0.72, { fontSize: 13.2, color: 'CBD5E1', valign: 'top' })
  rect(s, 8.37, 5.61, 4.04, 0.73, C.teal, C.teal, false)
  addText(s, 'PROBLEM  →  TECHNICIAN  →  FIXED', 8.57, 5.77, 3.65, 0.29, { fontSize: 10.3, bold: true, color: C.white, align: 'center', charSpacing: 0.6 })
  addText(s, 'Trust, operationalized.', 8.38, 6.61, 3.98, 0.25, { fontSize: 10.5, italic: true, color: '99F6E4', align: 'right' })
  footer(s, true)
  addNote(s, 'The Vision', '7addak replaces a stressful, fragmented process with five memorable actions and one accountable service promise.', 'Close on the promise: Problem → Technician → Fixed.')
}

if (notes.length !== 10 || pptx._slides.length !== 10) {
  throw new Error(`Expected exactly 10 slides; found ${pptx._slides.length} slides and ${notes.length} notes`)
}

const markdown = `# 7addak Stakeholder Presentation — Presenter Notes

Generated: 2026-10-01  
Deck: \`7addak_Stakeholder_Presentation.pptx\`  
Format: 16:9 widescreen with editable PowerPoint text and native vector diagrams

## Positioning

7addak is presented as a managed on-demand home-maintenance marketplace: one accountable service experience from a customer describing a problem to a verified professional resolving it.

## Evidence and claim discipline

- This is a pre-build business concept presentation, not a product or technical presentation.
- It contains no claims of current customers, revenue, valuation, market size, growth, or financial projections.
- No commission percentage is assumed.
- Maintenance plans, subscriptions, corporate accounts, preventive maintenance, priority service, and new categories are explicitly labeled as future opportunities.
- Warranty language is framed as potential or appropriate to the service model, not a current operating claim.

## Visual system

- Deep Navy: #0F172A
- Teal: #0F766E
- Warm Amber: #F59E0B, used sparingly
- Off White: #F8FAFC
- Typeface: Aptos / Aptos Display
- All diagrams and the 7addak mark are editable native PowerPoint shapes.

## Slide-by-slide notes

${notes.map((note, index) => `### ${String(index + 1).padStart(2, '0')} — ${note.title}

**Emphasize:** ${note.emphasize}

**Transition:** ${note.transition}
`).join('\n')}
`

fs.writeFileSync(NOTES, markdown, 'utf8')
await pptx.writeFile({ fileName: OUT })
console.log(`Generated ${path.basename(OUT)} with exactly ${pptx._slides.length} slides`)
console.log(`Generated ${path.basename(NOTES)}`)
