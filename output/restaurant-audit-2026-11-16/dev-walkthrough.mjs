import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { DEMO_PASSWORD, RESTAURANTS } from '../../apps/api/scripts/seed/horeca-data.mjs'

const web = 'https://app-dev.supplifyerp.com'
const folder = new URL('./', import.meta.url)
const stage = process.argv.find((arg) => arg.startsWith('--stage='))?.slice(8) ?? 'before'
const width = Number(process.argv.find((arg) => arg.startsWith('--width='))?.slice(8) ?? 1440)
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width, height: 1000 } })
const page = await context.newPage()
const errors = []
const failures = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 2500))
})
page.on('response', (response) => {
  if (response.status() >= 400 && new URL(response.url()).hostname.endsWith('supplifyerp.com')) {
    failures.push({ path: new URL(response.url()).pathname, status: response.status() })
  }
})
try {
  await page.goto(`${web}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const signIn = page.getByTestId('login-button')
  await signIn.waitFor({ state: 'visible', timeout: 45000 })
  const popupPromise = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null)
  await signIn.click()
  const authPage = (await popupPromise) ?? page
  await authPage.locator('#username').waitFor({ timeout: 30000 })
  const email =
    process.argv.find((arg) => arg.startsWith('--account='))?.slice(10) ??
    'rami.haddad@rivierahotels.demo'
  const account = RESTAURANTS.find((row) => row.owner?.email === email)
  if (!account?.owner?.email || !DEMO_PASSWORD) throw new Error('Seeded review account unavailable')
  await authPage.locator('#username').fill(account.owner.email)
  await authPage.locator('#password').fill(DEMO_PASSWORD)
  await authPage.locator('#kc-login').click()
  await page.waitForURL(
    (url) => url.hostname === new URL(web).hostname && url.pathname.startsWith('/app'),
    { timeout: 45000 }
  )
  await page.waitForTimeout(2500)
  if (new URL(page.url()).pathname.startsWith('/legal/'))
    throw new Error(
      'Current legal consent is required for the seeded QA account; owner action needed'
    )
  console.log(
    JSON.stringify({ authenticated: true, path: new URL(page.url()).pathname, errors, failures })
  )
  const me = await context.request.get(`${web}/auth/me`)
  const meBody = await me.json()
  const user = meBody.data?.user ?? meBody.data
  console.log(
    JSON.stringify({ authMe: me.status(), role: user?.role, userKeys: Object.keys(user ?? {}) })
  )
  const routes = [
    '/app/orders',
    '/app/products',
    '/app/my-prices',
    '/app/quick-lists',
    '/app/cart',
    '/app/quote-requests',
    '/app/receiving',
    '/app/suppliers',
    '/app/reports',
    '/app/disputes',
    '/app/deals',
    '/app/price-intelligence',
    '/app/invoices',
    '/app/chat',
    '/app/recipe-costing',
    '/app/recipes',
    '/app/restaurant-inventory',
    '/app/settings',
    '/app/reservations',
    '/app/staff',
    '/app/consumer-menu',
    '/app/consumer-orders',
    '/app/consumer-loyalty',
    '/app/dashboard',
  ]
  const results = []
  const onlyRoutes = process.argv
    .find((arg) => arg.startsWith('--routes='))
    ?.slice(9)
    .split(',')
  for (const route of routes.filter(
    (route) =>
      !process.argv.includes('--deep-only') &&
      (!onlyRoutes || onlyRoutes.includes(route.split('/').at(-1)))
  )) {
    errors.length = 0
    failures.length = 0
    const started = Date.now()
    await page.goto(`${web}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2200)
    const content = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('h1,h2')].map((node) => node.textContent),
      text: (document.querySelector('main') ?? document.body).innerText.slice(0, 12000),
      overflow: document.documentElement.scrollWidth - innerWidth,
      controls: [...document.querySelectorAll('main button,main input,main select')].map(
        (node) => ({
          tag: node.tagName,
          text: node.textContent?.slice(0, 80),
          label: node.getAttribute('aria-label'),
          testId: node.getAttribute('data-testid'),
        })
      ),
      routeErrors: (() => {
        const root = document.getElementById('root')
        const key = Object.keys(root ?? {}).find((key) => key.startsWith('__reactContainer$'))
        let fiber = key ? root[key] : null
        fiber = fiber?.stateNode?.current ?? fiber
        const pending = fiber ? [fiber] : [],
          seen = new Set(),
          messages = []
        while (pending.length && seen.size < 10000) {
          const node = pending.pop()
          if (!node || seen.has(node)) continue
          seen.add(node)
          for (const value of [node.memoizedProps?.value, node.memoizedProps?.error]) {
            if (value instanceof Error)
              messages.push({ message: value.message, stack: value.stack?.slice(0, 3000) })
          }
          pending.push(node.child, node.sibling)
        }
        return messages
      })(),
    }))
    const result = {
      route,
      actualPath: new URL(page.url()).pathname,
      elapsedMs: Date.now() - started,
      errors: [...errors],
      failures: [...failures],
      ...content,
    }
    results.push(result)
    await page.screenshot({
      path: fileURLToPath(new URL(`${stage}-${width}-${route.split('/').at(-1)}.png`, folder)),
      fullPage: true,
    })
    await fs.writeFile(
      new URL(`${stage}-${width}-${onlyRoutes ? 'targeted' : 'walkthrough'}.json`, folder),
      JSON.stringify(results, null, 2)
    )
    console.log(
      JSON.stringify({
        route,
        headings: content.headings,
        errors: result.errors,
        failures: result.failures,
        overflow: result.overflow,
      })
    )
  }
  if (
    results.some(
      (row) =>
        row.errors.length || row.routeErrors.length || row.failures.length || row.overflow > 1
    )
  ) {
    process.exitCode = 1
  }
  if (process.argv.includes('--deep-only')) {
    const checks = []
    const selectedChecks = process.argv
      .find((arg) => arg.startsWith('--checks='))
      ?.slice(9)
      .toLowerCase()
    const settle = async () => {
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(700)
    }
    const visit = async (path) => {
      await page.goto(`${web}${path}`, { waitUntil: 'domcontentloaded' })
      await settle()
    }
    const check = async (name, fn) => {
      if (selectedChecks && !name.toLowerCase().includes(selectedChecks)) return
      errors.length = 0
      failures.length = 0
      const result = { name }
      try {
        result.detail = await fn()
        assert.equal(failures.length, 0, 'A hosted request failed')
        assert.equal(errors.length, 0, 'A browser error was recorded')
        result.status = 'passed'
      } catch (error) {
        result.status = 'failed'
        result.message = error.message
        await page.screenshot({
          path: fileURLToPath(new URL(`deep-failure-${checks.length}.png`, folder)),
          fullPage: true,
        })
      }
      result.errors = [...errors]
      result.failures = [...failures]
      checks.push(result)
      await fs.writeFile(
        new URL(`${stage}-${width}-deep-${selectedChecks ?? 'checks'}.json`, folder),
        JSON.stringify(checks, null, 2)
      )
      console.log(JSON.stringify(result))
    }
    await check('Corrections: supplier projection and inventory API responses', async () => {
      const requestData = async (path) => {
        const response = await context.request.get(`${web}${path}`)
        assert.equal(response.status(), 200, `${path} should succeed`)
        const body = await response.json()
        assert.equal(body.ok, true)
        return body.data
      }
      const orders = await requestData('/api/orders?limit=3')
      assert.ok(orders.orders.length > 0, 'Live order fixture is required')
      for (const order of orders.orders) {
        assert.ok(Object.hasOwn(order, 'supplier_name'))
        assert.ok(order.supplier_name === null || typeof order.supplier_name === 'string')
      }
      await requestData('/api/restaurant-intelligence/weekly-summary')
      const reorder = await requestData('/api/restaurant-inventory/reorder-assistance')
      for (const suggestion of reorder.suggestions) {
        assert.ok(typeof suggestion.productName === 'string' && suggestion.productName.length > 0)
      }
      await visit('/app/orders')
      await page.getByRole('columnheader', { name: 'Supplier', exact: true }).waitFor()
      return {
        restaurantSupplierProjection: true,
        weeklySummaryStatus: 200,
        reorderStatus: 200,
        namedSuggestions: reorder.suggestions.length,
      }
    })
    await check('Orders: list pagination changes the visible page', async () => {
      await visit('/app/orders')
      const links = () => page.getByRole('link', { name: 'View Details', exact: true })
      const before = await links().first().getAttribute('href')
      assert.ok(before)
      await page.getByTestId('orders-pagination-next').click()
      await settle()
      const after = await links().first().getAttribute('href')
      assert.notEqual(after, before)
      await page.getByTestId('orders-pagination-prev').click()
      await settle()
      assert.equal(await links().first().getAttribute('href'), before)
      return { pagination: 'forward and backward' }
    })
    await check('Orders: search and detail tabs', async () => {
      await visit('/app/orders')
      const href = await page
        .getByRole('link', { name: 'View Details', exact: true })
        .first()
        .getAttribute('href')
      const ref = href.split('/').at(-1).slice(0, 8)
      await page.getByRole('textbox', { name: 'Search orders', exact: true }).fill(ref)
      await settle()
      assert.ok((await page.locator('main').innerText()).toLowerCase().includes(ref.toLowerCase()))
      await visit(href)
      await page.getByTestId('order-detail-page').waitFor()
      const names = await page.getByRole('tab').allTextContents()
      for (const name of names) {
        await page.getByRole('tab', { name, exact: true }).click()
        await settle()
        assert.equal(
          await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
          0
        )
      }
      return { tabs: names }
    })
    await check('Products: search, detail, add to cart, quantity and removal', async () => {
      await visit('/app/products')
      const href = await page.locator('main a[href^="/app/products/"]').first().getAttribute('href')
      assert.ok(href)
      await visit(href)
      await page.getByTestId('product-detail-page').waitFor()
      await page.getByRole('button', { name: /^add to cart$/i }).click()
      await settle()
      await visit('/app/cart')
      const row = page.locator('[data-testid^="cart-item-row-"]').first()
      await row.waitFor()
      const before = await row.innerText()
      await row.getByRole('button', { name: /increase quantity/i }).click()
      await settle()
      assert.notEqual(await row.innerText(), before)
      await row.getByRole('button', { name: /decrease quantity/i }).click()
      await settle()
      await row.getByRole('button', { name: /remove item/i }).click()
      await settle()
      assert.ok(/cart is empty|no items in your cart/i.test(await page.locator('main').innerText()))
      return { product: href, cartRestoredEmpty: true, ordersSubmitted: 0 }
    })
    for (const route of routes.filter(
      (route) => !['/app/orders', '/app/products', '/app/cart'].includes(route)
    )) {
      await check(`${route}: nested tabs and views`, async () => {
        await visit(route)
        assert.equal(
          await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
          0,
          'Route rendered the crash screen'
        )
        const names = [...new Set(await page.getByRole('tab').allTextContents())]
        const visited = []
        for (const name of names) {
          const tab = page.getByRole('tab', { name, exact: true }).first()
          if (!(await tab.isVisible()) || (await tab.isDisabled())) continue
          await tab.click()
          await settle()
          visited.push(name)
          assert.equal(
            await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
            0,
            `Crash after opening ${name}`
          )
        }
        return { tabs: visited, headings: await page.locator('main h1,main h2').allTextContents() }
      })
    }
    for (const path of ['/app/quote-requests/new', '/app/recipes/new']) {
      await check(`Entries: ${path} form`, async () => {
        await visit(path)
        assert.equal(new URL(page.url()).pathname, path)
        assert.equal(
          await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
          0
        )
        await page.locator('main input').first().waitFor()
        return { formOpened: true, submitted: false }
      })
    }
    await check('Entries: chat conversation and composer', async () => {
      await visit('/app/chat')
      await page.locator('button.chat-list-item').first().click()
      await settle()
      const composer = page.locator('main textarea').first()
      await composer.waitFor()
      assert.equal(await composer.isEnabled(), true)
      return { conversationOpened: true, composerEnabled: true, messagesSent: 0 }
    })
    await check('Entries: dashboard spend periods and calendar views', async () => {
      await visit('/app/dashboard')
      const periods = page.locator('button[data-testid^="spend-trend-period-"]')
      const periodIds = await periods.evaluateAll((nodes) =>
        nodes.map((node) => node.dataset.testid)
      )
      assert.ok(periodIds.length >= 2)
      const originalPeriod = await page
        .locator('button[data-testid^="spend-trend-period-"][aria-pressed="true"]')
        .getAttribute('data-testid')
      for (const id of periodIds) {
        await page.getByTestId(id).click()
        await settle()
        assert.equal(await page.getByTestId(id).getAttribute('aria-pressed'), 'true')
      }
      await page.getByTestId(originalPeriod).click()
      const views = [
        ['Week', 'timeGridWeek'],
        ['Day', 'timeGridDay'],
        ['Agenda', 'listWeek'],
        ['Month', 'dayGridMonth'],
      ]
      for (const [name, view] of views) {
        await page.getByRole('button', { name, exact: true }).click()
        await settle()
        await page.locator(`.fc-${view}-view`).waitFor()
      }
      return { periods: periodIds, calendarViews: views.map(([name]) => name) }
    })
    await check('Invoices: detail and real PDF response', async () => {
      await visit('/app/invoices')
      await page
        .getByRole('button', { name: /^view( invoice)?$/i })
        .first()
        .click()
      await settle()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      assert.ok((await dialog.innerText()).length > 100)
      const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
      await dialog.getByRole('button', { name: /pdf/i }).click()
      const download = await downloadPromise
      const stream = await download.createReadStream()
      const chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      const bytes = Buffer.concat(chunks)
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
      return { filename: download.suggestedFilename(), bytes: bytes.length }
    })
    await check('Actions: ordering list contents and transfer to cart', async () => {
      await visit('/app/quick-lists')
      await page.getByRole('button', { name: 'View', exact: true }).first().click()
      await settle()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      assert.ok((await dialog.innerText()).length > 100)
      await page.keyboard.press('Escape')
      await settle()
      await page.getByRole('button', { name: 'Order', exact: true }).first().click()
      await settle()
      await page.waitForURL('**/app/cart')
      await page.locator('[data-testid^="cart-item-row-"]').first().waitFor({ timeout: 15000 })
      assert.ok((await page.locator('[data-testid^="cart-item-row-"]').count()) > 0)
      await page.getByRole('button', { name: /clear cart/i }).click()
      await settle()
      return { listLoaded: true, cartTransferredAndCleared: true, purchaseSubmitted: false }
    })
    await check('Actions: receiving delivery form', async () => {
      await visit('/app/receiving')
      await page.getByRole('button', { name: 'Receive now', exact: true }).first().click()
      await settle()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      assert.ok((await dialog.locator('input').count()) > 0)
      assert.equal(
        await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
        0
      )
      return { receiptFormOpened: true, receiptSubmitted: false }
    })
    for (const [name, route, detailPrefix] of [
      ['quote comparison', '/app/quote-requests', '/app/quote-requests/'],
      ['supplier detail', '/app/suppliers', '/app/suppliers/'],
      ['dispute detail', '/app/disputes', '/app/disputes/'],
      ['recipe detail', '/app/recipes', '/app/recipes/'],
    ]) {
      await check(`Actions: ${name}`, async () => {
        await visit(route)
        const hrefs = await page
          .locator('main a[href]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
        const href = hrefs.find((href) => href?.startsWith(detailPrefix) && !href.endsWith('/new'))
        if (!href) return { emptyState: true, liveDetailFixtureAvailable: false }
        await visit(href)
        assert.equal(
          await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
          0
        )
        assert.ok((await page.locator('main').innerText()).length > 100)
        return {
          detailPath: href,
          headings: await page.locator('main h1,main h2').allTextContents(),
        }
      })
    }
    await check('Actions: purchasing filters', async () => {
      const verified = []
      for (const route of [
        '/app/orders',
        '/app/products',
        '/app/my-prices',
        '/app/invoices',
        '/app/recipes',
      ]) {
        await visit(route)
        const select = page.locator('main select').first()
        if (!(await select.count()) || (await select.locator('option').count()) < 2) continue
        const original = await select.inputValue()
        await select.selectOption({ index: 1 })
        await settle()
        assert.equal(
          await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
          0
        )
        await select.selectOption(original)
        await settle()
        verified.push(route)
      }
      return { verified }
    })
    await check('Actions: report CSV export', async () => {
      await visit('/app/reports')
      const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
      await page
        .getByRole('button', { name: /export.*csv|download.*csv/i })
        .first()
        .click()
      const download = await downloadPromise
      const stream = await download.createReadStream(),
        chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      const csv = Buffer.concat(chunks).toString('utf8')
      assert.ok(csv.length > 20 && !csv.trim().startsWith('<'))
      return {
        filename: download.suggestedFilename(),
        bytes: Buffer.byteLength(csv),
        header: csv.split(/\r?\n/)[0],
      }
    })
    if (checks.some((row) => row.status === 'failed')) process.exitCode = 1
  }
} catch (error) {
  await page.screenshot({
    path: fileURLToPath(new URL('dev-entry-failure.png', folder)),
    fullPage: true,
  })
  console.log(
    JSON.stringify({
      error: error.message,
      path: new URL(page.url()).pathname,
      title: await page.title(),
      buttons: await page.getByRole('button').allTextContents(),
      errors,
      failures,
    })
  )
  process.exitCode = 1
} finally {
  await browser.close()
}
