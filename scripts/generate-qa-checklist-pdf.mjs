#!/usr/bin/env node
/**
 * Generate printable PDF for docs/qa/regression-checklist.md
 * Usage: node scripts/generate-qa-checklist-pdf.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { marked } from 'marked'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_MD = path.join(ROOT, 'docs/qa/regression-checklist.md')
const CSS_PATH = path.join(ROOT, 'docs/qa/styles/qa-checklist-print.css')
const OUT_DIR = path.join(ROOT, 'docs/qa/output')
const OUT_HTML = path.join(OUT_DIR, 'Supplify-Manual-QA-Checklist.html')
const OUT_PDF = path.join(OUT_DIR, 'Supplify-Manual-QA-Checklist.pdf')

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function buildHtml({ markdown, css, date, commit }) {
  marked.setOptions({ gfm: true, breaks: false })
  const bodyHtml = marked.parse(markdown)
  const cssText = fs.readFileSync(css, 'utf8')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Supplify Manual QA Checklist</title>
  <style>${cssText}</style>
</head>
<body>
  <section class="cover">
    <h1>Supplify Manual QA Checklist</h1>
    <p class="subtitle">Web ERP, Android, and iOS — end-to-end manual regression</p>
    <p class="meta">
      Generated ${date}<br />
      Repository commit ${commit}<br />
      Source: docs/qa/regression-checklist.md
    </p>
  </section>
  <main class="content">${bodyHtml}</main>
</body>
</html>`
}

async function main() {
  if (!fs.existsSync(SOURCE_MD)) {
    console.error('Missing', SOURCE_MD)
    process.exit(1)
  }
  if (!fs.existsSync(CSS_PATH)) {
    console.error('Missing', CSS_PATH)
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const markdown = fs.readFileSync(SOURCE_MD, 'utf8')
  const date = new Date().toISOString().slice(0, 10)
  const commit = gitCommit()
  const html = buildHtml({ markdown, css: CSS_PATH, date, commit })

  fs.writeFileSync(OUT_HTML, html, 'utf8')
  console.log('Wrote', OUT_HTML)

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`file:///${OUT_HTML.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    })
    await page.emulateMedia({ media: 'print' })
    await page.pdf({
      path: OUT_PDF,
      format: 'A4',
      landscape: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate:
        '<div style="width:100%;font-size:7px;color:#8B6914;text-align:center;padding:0 8mm;font-family:Segoe UI,Arial,sans-serif;">Supplify Manual QA · Web + Mobile</div>',
      footerTemplate:
        '<div style="width:100%;font-size:7px;color:#666;text-align:center;padding:0 8mm;font-family:Segoe UI,Arial,sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '14mm', bottom: '14mm', left: '8mm', right: '8mm' },
    })
    const stat = fs.statSync(OUT_PDF)
    console.log(`Wrote ${OUT_PDF} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
