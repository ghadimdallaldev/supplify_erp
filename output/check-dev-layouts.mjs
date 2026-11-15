import { webkit, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDevSession } from './dev-session.mjs'
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1'
const session = await getDevSession()
const folder = path.resolve('output/dev-verification-2026-11-14')
const browser = await webkit.launch({ headless: true })
const results = []
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 834 }, hasTouch: true, isMobile: false, serviceWorkers: 'block', timezoneId: 'Asia/Beirut', reducedMotion: 'reduce' })
  await context.addInitScript(() => localStorage.setItem('i18nextLng', 'en'))
  await context.addCookies(['app-dev.supplifyerp.com', 'api-dev.supplifyerp.com'].flatMap(domain => [
    { name: 'access_token', value: session.token, domain, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    { name: 'refresh_token', value: session.refreshToken, domain, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
  ]))
  await context.route('**/auth/me', async route => {
    const response = await route.fetch(), body = await response.json(), user = body.data ?? body
    const testUser = { ...user, legalStatus: { ...user.legalStatus, needsReacceptance: false } }
    await route.fulfill({ response, json: body.data ? { ...body, data: testUser } : testUser })
  })
  for (const [name, route] of [['reports', '/app/reports'], ['receiving', '/app/receiving'], ['reorder', '/app/restaurant-inventory'], ['invoice-layout', '/app/invoices'], ['guest-rewards-signed-out', '/order/hamra-bistro/rewards']]) {
    const page = await context.newPage()
    page.setDefaultTimeout(25000)
    const errors = [], httpErrors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => { const url = new URL(response.url()); if (url.hostname === 'api-dev.supplifyerp.com' && response.status() >= 500) httpErrors.push({ path: url.pathname, status: response.status() }) })
    console.log(JSON.stringify({ checking: name }))
    try {
      const reorderResponse = name === 'reorder' ? page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/reorder-assistance') && response.request().method() === 'GET') : null
      await page.goto(session.web + route, { waitUntil: 'domcontentloaded' })
      if (name === 'reports') await page.getByTestId('report-filters').waitFor()
      if (name === 'receiving') { await page.getByTestId('receiving-page').waitFor(); await expect(page.getByText(/Quality:/).first()).toBeVisible(); expect(await page.locator('body').innerText()).not.toMatch(/\d\.\d{5,}/) }
      if (name === 'reorder') {
        const response = await reorderResponse, body = await response.json(), data = body.data ?? body
        await page.getByText('Reorder assistance', { exact: true }).waitFor()
        const cart = page.locator('#reorder-assistance').getByRole('link', { name: 'Cart', exact: true }).first()
        await cart.waitFor()
        const href = await cart.getAttribute('href'), id = href.split('/').pop()
        const suggestion = data.suggestions.find(item => String(item.productId) === id)
        expect(suggestion).toBeTruthy()
        await cart.click()
        const quantity = page.getByLabel('Quantity', { exact: true })
        await quantity.waitFor()
        const actual = Number(await quantity.inputValue())
        expect(actual).toBeGreaterThanOrEqual(Number(suggestion.suggestedQty))
        results.push({ name: 'live-reorder-quantity', suggested: Number(suggestion.suggestedQty), productQuantity: actual, productId: id })
      }
      if (name === 'invoice-layout') {
        await page.getByRole('button', { name: /view details|details|view invoice/i }).first().click()
        const dialog = page.getByRole('dialog')
        await page.getByText('Line Items', { exact: true }).waitFor()
        await expect(dialog).toBeVisible()
        await dialog.screenshot({ path: path.join(folder, 'viewport-invoice-detail.png'), animations: 'disabled', timeout: 10000 })
        const close = await dialog.getByRole('button', { name: 'Close', exact: true }).last().boundingBox(), payment = await dialog.getByRole('button', { name: /make payment/i }).boundingBox()
        expect(close.y + close.height).toBeLessThanOrEqual(payment.y)
        results.push({ name: 'invoice-close-payment-gap', verticalGap: payment.y - (close.y + close.height) })
        await dialog.getByRole('button', { name: /make payment/i }).click()
        await page.getByLabel(/payment date/i).waitFor()
        await page.getByRole('dialog').screenshot({ path: path.join(folder, 'viewport-payment.png'), animations: 'disabled', timeout: 10000 })
      }
      if (name === 'guest-rewards-signed-out') { await page.waitForURL('**/account'); await page.getByLabel('Username', { exact: true }).waitFor(); expect(await page.getByRole('progressbar').count()).toBe(0) }
      for (const width of [768, 1024, 1194]) {
        await page.setViewportSize({ width, height: 834 })
        await page.screenshot({ path: path.join(folder, `viewport-${name}-${width}.png`), animations: 'disabled', timeout: 10000 })
        const dimensions = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, controls: [...document.querySelectorAll('input[type=date],select')].filter(node => node.getBoundingClientRect().width > 0).map(node => ({ id: node.id, type: node.type, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })) }))
        expect(dimensions.overflow).toBe(0)
        if (name === 'reports') for (const control of dimensions.controls) expect(control.height).toBe(40)
        results.push({ name, width, ...dimensions, errors: [...errors], httpErrors: [...httpErrors] })
      }
    } catch (error) { results.push({ name, testError: error.message, errors, httpErrors, url: new URL(page.url()).pathname }); await page.screenshot({ path: path.join(folder, `failure-extra-${name}.png`), timeout: 8000 }).catch(() => {}) }
    finally { await fs.writeFile(path.join(folder, 'browser-layouts.json'), JSON.stringify(results, null, 2)); await page.close() }
  }
} finally { await browser.close() }
console.log(JSON.stringify({ checks: results.length, failures: results.filter(result => result.testError || result.errors?.length || result.httpErrors?.length) }))
