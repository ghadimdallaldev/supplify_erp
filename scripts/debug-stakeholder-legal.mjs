import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto('http://localhost:5173/app/dashboard')
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  if (page.url().includes('/login')) await page.getByTestId('login-button').click()
  await page.waitForURL((url) => url.href.includes('/realms/Supplify/'))
  await page.locator('#username').fill('restaurant-marina@supplify.com')
  await page.locator('#password').fill('Supplify1!')
  await page.locator('#kc-login').click()
  await page.waitForURL((url) => url.origin === 'http://localhost:5173')
  await page.waitForTimeout(1500)
  console.log('Before URL', page.url())
  const boxes = page.locator('input[type="checkbox"]')
  console.log('Checkboxes', await boxes.count())
  for (let i = 0; i < (await boxes.count()); i += 1) {
    const box = boxes.nth(i)
    console.log('before', i, await box.getAttribute('data-testid'), await box.isChecked(), await box.isDisabled())
    await box.check()
    console.log('after', i, await box.isChecked())
  }
  const button = page.getByRole('button', { name: /accept and continue/i })
  console.log('Button disabled', await button.isDisabled())
  await button.click()
  await page.waitForTimeout(3000)
  console.log('After URL', page.url())
  console.log('After body', (await page.locator('body').innerText()).slice(0, 1200))
} finally {
  await page.context().close()
  await browser.close()
}
