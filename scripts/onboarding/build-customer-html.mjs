import fs from 'node:fs'
import { BRAND, FONTS, TAGLINE, SUBTITLE } from './customer-brand.mjs'

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildPremiumCustomerHtml({ bodyHtml, tocHtml, css, date, logoSvg }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Supplify — Customer Overview</title>
  <style>${css}</style>
</head>
<body>
  <section class="cover-premium">
    <div class="cover-bg-shape cover-bg-shape-1"></div>
    <div class="cover-bg-shape cover-bg-shape-2"></div>
    <div class="cover-bg-shape cover-bg-shape-3"></div>
    <div class="cover-inner">
      <div class="cover-logo">${logoSvg}</div>
      <h1 class="cover-title">Supplify</h1>
      <p class="cover-tagline">${escapeHtml(TAGLINE)}</p>
      <p class="cover-subtitle">${escapeHtml(SUBTITLE)}</p>
      <div class="cover-pills">
        <span>Ordering</span><span>Fulfillment</span><span>Receiving</span><span>Finance</span>
      </div>
      <p class="cover-meta">Customer overview · ${escapeHtml(date)}</p>
    </div>
  </section>

  <section class="stats-strip">
    <div class="stat-item">
      <div class="stat-num">One</div>
      <div class="stat-label">shared record from cart to payment</div>
    </div>
    <div class="stat-item">
      <div class="stat-num">2</div>
      <div class="stat-label">sides connected — restaurant &amp; supplier</div>
    </div>
    <div class="stat-item">
      <div class="stat-num">6</div>
      <div class="stat-label">steps in the order journey</div>
    </div>
    <div class="stat-item">
      <div class="stat-num">4</div>
      <div class="stat-label">plans that scale with you</div>
    </div>
  </section>

  ${tocHtml ? `<nav class="toc-premium">${tocHtml}</nav>` : ''}

  <main class="content-premium">${bodyHtml}</main>

  <section class="closing-cta">
    <h2>Ready to see Supplify in action?</h2>
    <p>Book a tailored demo with your Supplify representative — restaurant, supplier, or full marketplace scenario.</p>
    <div class="cta-steps">
      <div><strong>1</strong> Discovery call</div>
      <div><strong>2</strong> Live walkthrough</div>
      <div><strong>3</strong> Free trial &amp; go-live plan</div>
    </div>
    <p class="closing-foot">© Supplify · Restaurant &amp; F&amp;B supplier marketplace</p>
  </section>

  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      if (typeof mermaid === 'undefined') return;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: '#F0E8DC',
          primaryTextColor: '#1A1A1A',
          primaryBorderColor: '#8B6914',
          lineColor: '#8B6914',
          secondaryColor: '#FAF7F2',
          tertiaryColor: '#E8DCC8',
          fontFamily: '${FONTS.body}, Arial, sans-serif',
        },
        securityLevel: 'loose',
      });
      try { await mermaid.run({ querySelector: '.mermaid' }); }
      catch (e) { document.querySelectorAll('.mermaid').forEach(el => el.classList.add('mermaid-fallback')); }
    });
  </script>
</body>
</html>`
}

export function loadLogoSvg(root) {
  const path = `${root}/apps/web/static/favicon.svg`
  try {
    let svg = fs.readFileSync(path, 'utf8')
    svg = svg.replace(/#7c3aed/gi, '#8B6914').replace(/#5b21b6/gi, '#6B5210')
    return svg.replace('<svg ', '<svg class="logo-svg" ')
  } catch {
    return '<div class="logo-fallback">S</div>'
  }
}
