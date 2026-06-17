#!/usr/bin/env node
/**
 * Generate Supplify-Complete-Handbook.pdf from assembled markdown handbook.
 * Usage: node scripts/generate-onboarding-pdf.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import {
  buildHandbookHtml,
  extractTocFromMarkdown,
  markdownToHtmlBody,
  resolveOnboardingPath,
  readMarkdownFile,
} from './onboarding/md-to-html.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/onboarding/output')
const HANDBOOK_MD = path.join(ROOT, 'docs/onboarding/Supplify-Complete-Handbook.md')
const CSS = path.join(ROOT, 'docs/onboarding/styles/handbook-print.css')
const OUT_HTML = path.join(OUT_DIR, 'Supplify-Complete-Handbook.html')
const OUT_PDF = path.join(OUT_DIR, 'Supplify-Complete-Handbook.pdf')

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

async function main() {
  if (!fs.existsSync(HANDBOOK_MD)) {
    console.error('Missing handbook. Run: node docs/onboarding/_assemble-handbook.mjs')
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const markdown = readMarkdownFile(HANDBOOK_MD)
  const tocHtml = extractTocFromMarkdown(markdown)
  const bodyHtml = markdownToHtmlBody(markdown, { demoteH1: true })

  const disclaimer =
    'This handbook reflects implementation status in the repository at generation time. ' +
    'Where documentation and code disagree, the code is authoritative. See Part XVI — Implementation Status.'

  const html = buildHandbookHtml({
    title: 'Supplify Complete Handbook',
    subtitle: 'Restaurant & F&B supplier marketplace — product, onboarding, and technical reference',
    version: '1.0',
    date: new Date().toISOString().slice(0, 10),
    commit: gitCommit(),
    disclaimer,
    tocHtml,
    bodyHtml,
    cssPath: CSS,
  })

  fs.writeFileSync(OUT_HTML, html, 'utf8')
  console.log('Wrote', OUT_HTML)

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`file:///${OUT_HTML.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
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
      headerTemplate:
        '<div style="width:100%;font-size:8px;color:#8B6914;text-align:center;padding:0 14mm;font-family:Segoe UI,Arial,sans-serif;">Supplify Complete Handbook</div>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#666;text-align:center;padding:0 14mm;font-family:Segoe UI,Arial,sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '18mm', bottom: '20mm', left: '12mm', right: '12mm' },
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
