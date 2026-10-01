#!/usr/bin/env node
/** Accept the current legal pack for the three isolated marketing-demo users. */
import { chromium } from '@playwright/test'

const users = [
  'restaurant-marina@supplify.com',
  'supplier-al-barsha@supplify.com',
  'be-demo-al-barsha-foods-driver@supplify.com',
]

const browser = await chromium.launch({ headless: true })
try {
  for (const email of users) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('http://localhost:5173/app/dashboard')
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    if (page.url().includes('/login')) await page.getByTestId('login-button').click()
    await page.waitForURL((url) => url.href.includes('/realms/Supplify/'))
    await page.locator('#username').fill(email)
    await page.locator('#password').fill('Supplify1!')
    await page.locator('#kc-login').click()
    await page.waitForURL((url) => url.origin === 'http://localhost:5173')
    await page.waitForTimeout(1_500)
    if (page.url().includes('/legal/reaccept')) {
      const boxes = page.locator('input[type="checkbox"]')
      for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check()
      const submit = page.getByRole('button', { name: /accept and continue/i })
      await submit.click()
      await page.waitForURL((url) => !url.pathname.includes('/legal/reaccept'))
      console.log(`Accepted current legal pack: ${email}`)
    } else {
      console.log(`Legal pack already current: ${email}`)
    }
    await context.close()
  }
} finally {
  await browser.close()
}
