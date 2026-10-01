#!/usr/bin/env node
/**
 * Capture clean, deterministic Supplify marketing-demo screenshots for the
 * stakeholder presentation. Requires the local API/Web/Keycloak stack and
 * `node apps/api/scripts/seed-marketing-demo.mjs`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'presentation_source', 'assets', 'screenshots')
const BASE_URL = process.env.PRESENTATION_BASE_URL || 'http://localhost:5173'
const PASSWORD = process.env.PRESENTATION_DEMO_PASSWORD || 'Supplify1!'

const USERS = {
  restaurant: 'restaurant-marina@supplify.com',
  supplier: 'supplier-al-barsha@supplify.com',
  driver: 'be-demo-al-barsha-foods-driver@supplify.com',
}

async function waitForCalm(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {})
  await page.waitForTimeout(1_200)
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
      [data-sonner-toaster], .sonner-toaster { display: none !important; }
    `,
  })
}

async function login(page, email) {
  await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {})

  if (page.url().includes('/login')) {
    await page.getByTestId('login-button').click()
  }

  await page.waitForURL((url) => url.href.includes('/realms/Supplify/'), { timeout: 20_000 })
  await page.locator('#username, input[name="username"]').first().fill(email)
  await page.locator('#password, input[name="password"]').first().fill(PASSWORD)
  await page.locator('#kc-login, button[type="submit"]').first().click()
  await page.waitForURL((url) => url.origin === new URL(BASE_URL).origin, { timeout: 25_000 })
  await page.locator('[data-testid="sidebar"], [data-testid="admin-sidebar"], [data-testid="admin-shell"]').first().waitFor({ state: 'visible', timeout: 20_000 })
  await waitForCalm(page)
}

async function capturePage(page, route, filename, { fullPage = false } = {}) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' })
  await waitForCalm(page)
  await page.screenshot({
    path: path.join(OUT, filename),
    fullPage,
    animations: 'disabled',
  })
  console.log(`Captured ${filename} <- ${page.url()}`)
}

async function captureRole(browser, role, captures, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1.5,
    colorScheme: 'light',
    locale: 'en-US',
  })
  const page = await context.newPage()
  await login(page, USERS[role])
  for (const capture of captures) {
    await capturePage(page, capture.route, capture.filename, capture.options)
  }
  await context.close()
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    await captureRole(browser, 'restaurant', [
      { route: '/app/dashboard', filename: 'restaurant-dashboard.png' },
      { route: '/app/restaurant-inventory', filename: 'restaurant-inventory.png' },
      { route: '/app/receiving', filename: 'restaurant-receiving.png' },
    ])

    await captureRole(browser, 'supplier', [
      { route: '/app/command-center', filename: 'supplier-command-center.png' },
      { route: '/app/fulfillment', filename: 'supplier-fulfillment.png' },
      { route: '/app/contract-pricing', filename: 'supplier-contract-pricing.png' },
    ])

    await captureRole(
      browser,
      'driver',
      [{ route: '/app/driver-deliveries', filename: 'driver-deliveries-mobile.png' }],
      { width: 390, height: 844 }
    )

    const publicContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.5,
      colorScheme: 'light',
      locale: 'en-US',
    })
    const publicPage = await publicContext.newPage()
    await capturePage(
      publicPage,
      '/order/be-demo-marina-trattoria/menu',
      'public-ordering-menu.png'
    )
    await capturePage(
      publicPage,
      '/supplier/be-demo-al-barsha-foods',
      'public-supplier-catalog.png'
    )
    await publicContext.close()
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
