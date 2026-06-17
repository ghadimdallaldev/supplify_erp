#!/usr/bin/env node
/**
 * Premium customer leave-behind PDF.
 * Usage: node scripts/generate-customer-presentation-pdf.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { buildPremiumCustomerHtml, loadLogoSvg } from './onboarding/build-customer-html.mjs'
import { extractTocFromMarkdown, markdownToHtmlBody, readMarkdownFile } from './onboarding/md-to-html.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/onboarding/output')
const SOURCE_MD = path.join(ROOT, 'docs/onboarding/Supplify-Customer-Presentation.md')
const CSS = path.join(ROOT, 'docs/onboarding/styles/customer-presentation-premium.css')
const OUT_HTML = path.join(OUT_DIR, 'Supplify-Customer-Presentation.html')
const OUT_PDF = path.join(OUT_DIR, 'Supplify-Customer-Presentation.pdf')

async function main() {
  if (!fs.existsSync(SOURCE_MD)) {
    console.error('Missing', SOURCE_MD)
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const markdown = readMarkdownFile(SOURCE_MD)
  const tocHtml = extractTocFromMarkdown(markdown)
    .replace('<h2>Table of Contents</h2>', '<h2>What’s inside</h2>')
  const bodyHtml = markdownToHtmlBody(markdown, { demoteH1: true })
  const css = fs.readFileSync(CSS, 'utf8')
  const logoSvg = loadLogoSvg(ROOT)

  const html = buildPremiumCustomerHtml({
    bodyHtml,
    tocHtml,
    css,
    date: new Date().toISOString().slice(0, 10),
    logoSvg,
  })

  fs.writeFileSync(OUT_HTML, html, 'utf8')
  console.log('Wrote', OUT_HTML)

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`file:///${OUT_HTML.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle',
      timeout: 90_000,
    })
    await page.waitForFunction(
      () => {
        const blocks = document.querySelectorAll('.mermaid')
        if (!blocks.length) return true
        return [...blocks].every((el) => el.querySelector('svg') || el.classList.contains('mermaid-fallback'))
      },
      { timeout: 90_000 }
    )
    await page.emulateMedia({ media: 'print' })
    await page.pdf({
      path: OUT_PDF,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="width:100%;padding:0 10mm;display:flex;align-items:center;justify-content:space-between;font-family:Georgia,serif;font-size:8px;color:#8B6914;">
        <span style="font-weight:700;letter-spacing:0.15em;">SUPPLIFY</span>
        <span style="color:#5C5348;font-family:Segoe UI,sans-serif;">Customer overview</span>
      </div>`,
      footerTemplate: `<div style="width:100%;text-align:center;font-size:7px;color:#8B6914;font-family:Segoe UI,sans-serif;padding:0 10mm;">
        <span class="pageNumber"></span> · supplify.com
      </div>`,
      margin: { top: '14mm', bottom: '16mm', left: '10mm', right: '10mm' },
    })
    const stat = fs.statSync(OUT_PDF)
    console.log(`Wrote ${OUT_PDF} (${(stat.size / 1024).toFixed(0)} KB)`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
