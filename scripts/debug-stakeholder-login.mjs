import path from 'node:path'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
try {
  await page.goto('http://localhost:5173/app/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  if (page.url().includes('/login')) await page.getByTestId('login-button').click()
  await page.waitForURL((url) => url.href.includes('/realms/Supplify/'), { timeout: 20_000 })
  await page.locator('#username').fill('restaurant-marina@supplify.com')
  await page.locator('#password').fill('Supplify1!')
  await page.locator('#kc-login').click()
  await page.waitForTimeout(7_000)
  console.log('URL:', page.url())
  console.log('TITLE:', await page.title())
  console.log('BODY:', (await page.locator('body').innerText()).slice(0, 2000))
  await page.screenshot({
    path: path.resolve('presentation_source/assets/screenshots/debug-login.png'),
    fullPage: true,
  })
} finally {
  await context.close()
  await browser.close()
}
