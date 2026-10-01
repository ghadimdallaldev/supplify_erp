#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'presentation_source', 'assets', 'screenshots')
const BASE = process.env.PRESENTATION_WEB_ORIGIN || 'http://localhost:5173'
const PASSWORD = process.env.SEED_ACCOUNTS_PASSWORD || 'Supplify1!'

fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })

async function signIn(email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    colorScheme: 'light',
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

  const username = page.locator('#username')
  if (!(await username.isVisible().catch(() => false))) {
    const signIn = page.getByRole('button', { name: /sign in|log in|continue/i }).first()
    if (await signIn.isVisible().catch(() => false)) await signIn.click()
  }

  await username.waitFor({ state: 'visible', timeout: 30000 })
  await username.fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('#kc-login').click()
  await page.waitForURL((url) => url.origin === new URL(BASE).origin, { timeout: 45000 })
  await page.waitForTimeout(3500)
  return { context, page }
}

async function capture(page, route, name, settle = 3500) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settle)
  await page.addStyleTag({ content: `
    [data-testid='assistant-fab'], .assistant-fab, button[aria-label*='assistant' i],
    button[aria-label*='chat' i] { display: none !important; }
    * { animation-duration: 0s !important; transition-duration: 0s !important; }
  ` }).catch(() => {})
  await page.screenshot({ path: path.join(OUT, name), fullPage: false })
  console.log(`Captured ${name}`)
}

try {
  const restaurant = await signIn('restaurant-marina@supplify.com')
  await capture(restaurant.page, '/app/dashboard', 'restaurant-dashboard.png', 5000)
  await capture(restaurant.page, '/app/inventory', 'restaurant-inventory.png', 4500)
  await capture(restaurant.page, '/app/receiving', 'restaurant-receiving.png', 4500)
  await restaurant.context.close()

  const supplier = await signIn('supplier-al-barsha@supplify.com')
  await capture(supplier.page, '/app/command-center', 'supplier-command-center.png', 5500)
  await capture(supplier.page, '/app/fulfillment', 'supplier-fulfillment.png', 5000)
  await supplier.context.close()

  const publicContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    colorScheme: 'light',
  })
  const publicPage = await publicContext.newPage()
  await capture(publicPage, '/supplier/be-demo-al-barsha-foods', 'public-supplier-catalog.png', 5000)
  await publicContext.close()
} finally {
  await browser.close()
}
