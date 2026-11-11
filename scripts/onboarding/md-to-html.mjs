#!/usr/bin/env node
/**
 * Convert onboarding markdown to print-ready HTML body + optional cover.
 */
import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: false,
})

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Replace fenced mermaid blocks with div.mermaid before marked parse */
function preprocessMermaid(markdown) {
  return markdown.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_match, body) => {
    const trimmed = body.trim()
    return `\n<div class="mermaid">\n${trimmed}\n</div>\n`
  })
}

/** Demote top-level # in handbook parts so CSS hierarchy stays sane */
function demotePartHeadings(html) {
  return html
    .replace(/<h1>/g, '<h2 class="part-title">')
    .replace(/<\/h1>/g, '</h2>')
}

export function markdownToHtmlBody(markdown, { demoteH1 = false } = {}) {
  const prepped = preprocessMermaid(markdown)
  let html = marked.parse(prepped)
  if (demoteH1) html = demotePartHeadings(html)
  return html
}

export function buildHandbookHtml({
  title,
  subtitle,
  version,
  date,
  commit,
  disclaimer,
  tocHtml,
  bodyHtml,
  cssPath,
  cssContent,
}) {
  const css = cssContent ?? fs.readFileSync(cssPath, 'utf8')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${css}</style>
</head>
<body>
  <section class="cover-page">
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
    <div class="meta">
      <div><strong>Version</strong> ${escapeHtml(version)}</div>
      <div><strong>Generated</strong> ${escapeHtml(date)}</div>
      ${commit ? `<div><strong>Repository commit</strong> <code>${escapeHtml(commit)}</code></div>` : ''}
      <div style="margin-top:1.5rem;max-width:28rem;font-size:0.8rem;">${disclaimer}</div>
    </div>
  </section>
  ${tocHtml ? `<nav class="toc content">${tocHtml}</nav>` : ''}
  <main class="content">${bodyHtml}</main>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      if (typeof mermaid === 'undefined') return;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose',
        fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif',
      });
      try {
        await mermaid.run({ querySelector: '.mermaid' });
      } catch (e) {
        document.querySelectorAll('.mermaid').forEach((el) => {
          el.classList.add('mermaid-fallback');
          el.textContent = 'Diagram render failed: ' + (el.textContent || '').slice(0, 200);
        });
      }
    });
  </script>
</body>
</html>`
}

export function extractTocFromMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/)
  const items = []
  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+)$/.exec(line.trim())
    if (!m) continue
    const level = m[1].length
    const text = m[2].replace(/\s*\(Internal Technical Reference\)\s*/gi, '').trim()
    if (level > 3) continue
    const id = text
      .toLowerCase()
      .replace(/[`*_]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
    items.push({ level, text, id })
  }
  if (!items.length) return ''
  const lis = items
    .map(({ level, text, id }) => {
      const pad = level === 1 ? '' : level === 2 ? 'padding-left:1rem;' : 'padding-left:2rem;'
      return `<li style="${pad}"><a href="#${id}">${escapeHtml(text)}</a></li>`
    })
    .join('\n')
  return `<h2>Table of Contents</h2><ul>${lis}</ul>`
}

export function readMarkdownFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

export function resolveOnboardingPath(...segments) {
  return path.join(process.cwd(), 'docs', 'onboarding', ...segments)
}
