import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const AxeBuilder = require(
  require.resolve('@axe-core/playwright', { paths: ['apps/horeca-experience'] })
).default

// Isolated presentation fixtures; no live account, API, or ordering mutations.
const stage = process.argv[2] || 'before'
const folder = new URL('./', import.meta.url)
const browser = await chromium.launch({ headless: true })
const results = []
const user = {
  id: 'dashboard-preview',
  email: 'preview@example.test',
  displayName: 'Maya Haddad',
  role: 'RESTAURANT',
  tenantRoles: ['Owner'],
  tenantPermissions: [],
  workspace: { tenantId: 'dashboard-restaurant', roleName: 'Owner' },
}
const summary = {
  stats: { totalSpent: 28460, totalOrders: 86, pendingOrders: 4, totalSuppliers: 12 },
  recentOrders: [
    {
      id: 'a47e9021-ce01-4000-8000-000000000001',
      supplier_name: 'Cedar Foods',
      total_amount: 428,
      status: 'CONFIRMED',
    },
    {
      id: 'b38f8052-ce01-4000-8000-000000000002',
      supplier_name: 'Bekaa Produce',
      total_amount: 186,
      status: 'DELIVERED',
    },
    {
      id: 'c29a7063-ce01-4000-8000-000000000003',
      supplier_name: 'Levant Dairy',
      total_amount: 264,
      status: 'PENDING',
    },
  ],
  spendTrend: Array.from({ length: 30 }, (_, i) => ({
    name: `10-${String(i + 1).padStart(2, '0')}`,
    value: [186, 264, 0, 428, 312, 94, 0, 240, 176, 392][i % 10],
  })),
  lowStockPreview: [],
}
try {
  for (const [width, locale, theme] of [
    [1440, 'en', 'light'],
    [390, 'en', 'light'],
    [1440, 'ar', 'light'],
    [390, 'ar', 'light'],
    [768, 'en', 'light'],
    [320, 'en', 'light'],
    [1440, 'en', 'dark'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      colorScheme: theme,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(
      ({ locale, theme }) => {
        localStorage.setItem('supplify.locale', locale)
        localStorage.setItem('theme', theme)
      },
      { locale, theme }
    )
    await page.routeWebSocket(/socket\.io/, (socket) => socket.close())
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      if (!path.startsWith('/api/') && !path.startsWith('/auth/')) return route.continue()
      let data = {
        orders: [],
        notifications: [],
        suppliers: [],
        conversations: [],
        branches: [],
        items: [],
        events: [],
        reminders: [],
        unreadCount: 0,
      }
      if (path === '/auth/me') data = { ...user, preferredLocale: locale }
      else if (path.includes('register/status')) data = { needsSetup: false }
      else if (path.includes('entitlements'))
        data = {
          entitlements: {
            plan: { code: 'gold', name: 'Gold' },
            features: {
              smart_reorder: true,
              inventory_management: true,
              quick_lists: true,
              finance_invoices: true,
              reports: true,
            },
            limits: {},
          },
        }
      else if (path.endsWith('/dashboard/summary')) data = summary
      else if (path.includes('reorder-suggestions'))
        data = {
          suggestions: [
            {
              id: 'reorder-1',
              product_id: 'olive-oil',
              supplier_id: 'cedar-foods',
              product_name: 'Extra virgin olive oil',
              current_qty: 3,
              suggested_reorder_qty: 12,
            },
            {
              id: 'reorder-2',
              product_id: 'tomatoes',
              supplier_id: 'bekaa-produce',
              product_name: 'Fresh tomatoes',
              current_qty: 6,
              suggested_reorder_qty: 20,
            },
          ],
        }
      else if (path.includes('/expiry/summary'))
        data = {
          summary: {
            expiringSoonCount: 3,
            expiredCount: 0,
            topNearestExpiry: [{ id: 'lot-1', itemName: 'Fresh milk', expiryDate: '2026-11-18' }],
          },
        }
      else if (path.includes('/quick-lists'))
        data = { quickLists: [{ id: 'weekly', name: 'Weekly kitchen order' }] }
      else if (path.includes('analytics')) data = { points: [] }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data, error: null }),
      })
    })
    await page.goto('http://127.0.0.1:5175/app/dashboard', { waitUntil: 'networkidle' })
    await page.getByTestId('dashboard-kpi-grid').waitFor()
    await page.waitForTimeout(1200)
    await page.evaluate(
      (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
      theme
    )
    await page.waitForTimeout(400)
    await page.evaluate(() => document.fonts.ready)
    const screenshot = new URL(
      `${stage}-${width}-${locale}${theme === 'dark' ? '-dark' : ''}.png`,
      folder
    )
    if (!process.argv.includes('--verify-only'))
      await page.screenshot({ path: fileURLToPath(screenshot), fullPage: true })
    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="dashboard-page"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    results.push({
      width,
      locale,
      theme,
      errors,
      violations: accessibility.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      })),
      ...(await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        dark: document.documentElement.classList.contains('dark'),
        overflowingMetrics: [...document.querySelectorAll('.restaurant-kpi-value')].filter(
          (node) => node.scrollWidth > node.clientWidth
        ).length,
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        text: document.body.innerText,
        dashboard: (() => {
          const node = document.querySelector('[data-testid="dashboard-page"]')
          const css = getComputedStyle(node)
          return { color: css.color, background: css.backgroundColor, font: css.fontFamily }
        })(),
        labels: [...document.querySelectorAll('[data-testid="dashboard-page"] h2')].map((node) => ({
          text: node.textContent,
          size: getComputedStyle(node).fontSize,
          weight: getComputedStyle(node).fontWeight,
          tracking: getComputedStyle(node).letterSpacing,
          transform: getComputedStyle(node).textTransform,
        })),
        chart: {
          lines: document.querySelectorAll('.restaurant-spend-chart .recharts-line-curve').length,
          ticks: [
            ...document.querySelectorAll(
              '.restaurant-spend-chart .recharts-cartesian-axis-tick-value'
            ),
          ].map((node) => node.textContent),
          width: document.querySelector('.restaurant-spend-chart')?.getBoundingClientRect().width,
        },
        arabicFont: document.fonts.check('14px "Supplify Arabic"'),
      }))),
    })
    const period = page.getByTestId('spend-trend-period-7d')
    if (await period.count()) {
      await period.click()
      if ((await period.getAttribute('aria-pressed')) !== 'true')
        throw new Error('Period selection did not update')
      results.at(-1).periodInteraction = 'passed'
    }
    await context.close()
  }
  await fs.writeFile(new URL(`${stage}-review.json`, folder), JSON.stringify(results, null, 2))
  console.log(
    JSON.stringify(
      results.map(
        ({
          width,
          locale,
          theme,
          overflow,
          overflowingMetrics,
          errors,
          violations,
          periodInteraction,
        }) => ({
          width,
          locale,
          theme,
          overflow,
          overflowingMetrics,
          errors,
          violations,
          periodInteraction,
        })
      ),
      null,
      2
    )
  )
  if (
    results.some(
      (result) =>
        result.overflow ||
        result.overflowingMetrics ||
        result.errors.length ||
        result.violations.length ||
        result.chart.lines !== 1 ||
        result.periodInteraction !== 'passed' ||
        result.dark !== (result.theme === 'dark') ||
        (result.locale === 'ar' && !result.arabicFont)
    )
  )
    process.exitCode = 1
} finally {
  await browser.close()
}
