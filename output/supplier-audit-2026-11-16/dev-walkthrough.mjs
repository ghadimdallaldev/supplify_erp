import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { DEMO_PASSWORD, SUPPLIERS } from '../../apps/api/scripts/seed/horeca-data.mjs'

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
    'karim.saab@cedarfresh.demo'
  const account = SUPPLIERS.find((row) => row.owner?.email === email)
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
    '/app/contract-pricing',
    '/app/fulfillment',
    '/app/inventory',
    '/app/run-sheet',
    '/app/restaurants',
    '/app/quote-requests/supplier',
    '/app/disputes',
    '/app/customer-growth',
    '/app/reports',
    '/app/promotions',
    '/app/loyalty',
    '/app/invoices',
    '/app/chat',
    '/app/settings',
    '/app/dashboard',
    '/app/command-center',
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
    for (const route of routes.filter((route) => route !== '/app/orders')) {
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
    for (const [name, route, button] of [
      ['new product', '/app/products', 'Add Product'],
      ['product CSV import', '/app/products', 'Bulk Upload'],
      ['product image import', '/app/products', 'Import Product Images'],
      ['product categories', '/app/products', 'Manage categories'],
      ['contract price', '/app/contract-pricing', 'Add contract price'],
      ['stock adjustment', '/app/inventory', 'Adjust'],
      ['new deal', '/app/promotions', 'Create deal'],
      ['invoice payment', '/app/invoices', 'Pay'],
    ]) {
      await check(`Actions: ${name} form`, async () => {
        await visit(route)
        await page.getByRole('button', { name: button, exact: true }).first().click()
        await settle()
        await page.getByRole('dialog').waitFor()
        assert.equal(
          await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
          0
        )
        return { formOpened: true, submitted: false }
      })
    }
    for (const [name, route, prefix] of [
      ['product', '/app/products', '/app/products/'],
      ['customer', '/app/restaurants', '/app/restaurants/'],
      ['quote response', '/app/quote-requests/supplier', '/app/quote-requests/supplier/'],
    ]) {
      await check(`Actions: ${name} detail`, async () => {
        await visit(route)
        const hrefs = await page
          .locator('main a[href]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
        const href = hrefs.find((href) => href?.startsWith(prefix) && !href.endsWith('/new'))
        if (!href && name === 'customer') {
          await page.getByRole('button', { name: 'Details', exact: true }).first().click()
          await page.waitForURL('**/app/restaurants/*')
          await settle()
          assert.equal(
            await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
            0
          )
          return { liveDetailFixtureAvailable: true }
        }
        if (!href) return { liveDetailFixtureAvailable: false }
        await visit(href)
        assert.equal(
          await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count(),
          0
        )
        assert.ok((await page.locator('main').innerText()).length > 100)
        return { liveDetailFixtureAvailable: true }
      })
    }
    await check('Actions: chat conversation and composer', async () => {
      await visit('/app/chat')
      await page.locator('button.chat-list-item').first().click()
      await settle()
      const composer = page.locator('main textarea').first()
      await composer.waitFor()
      assert.equal(await composer.isEnabled(), true)
      return { conversationOpened: true, messagesSent: 0 }
    })
    await check('Actions: warehouse stock view', async () => {
      await visit('/app/inventory')
      await page.getByRole('button', { name: 'By warehouse', exact: true }).click()
      await settle()
      assert.ok(/warehouse/i.test(await page.locator('main').innerText()))
      return { warehouseViewOpened: true }
    })
    await check('Actions: report CSV download', async () => {
      await visit('/app/reports')
      const pending = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
      const download = await pending,
        stream = await download.createReadStream(),
        chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      const csv = Buffer.concat(chunks).toString('utf8')
      assert.ok(csv.length > 20 && !csv.trim().startsWith('<'))
      return { bytes: Buffer.byteLength(csv), header: csv.split(/\r?\n/)[0] }
    })
    await check('Actions: customer import example download', async () => {
      await visit('/app/customer-growth')
      const pending = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download example CSV', exact: true }).click()
      const download = await pending,
        stream = await download.createReadStream(),
        chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      const csv = Buffer.concat(chunks).toString('utf8')
      assert.ok(csv.startsWith('Restaurant Name,Contact Person,Phone,Email,'))
      return { bytes: Buffer.byteLength(csv) }
    })
    await check('Views: deal status filters and report periods', async () => {
      await visit('/app/promotions')
      for (const name of ['Draft','Pending','Rejected','Awaiting payment','Live','Paused','Expired','All']) {
        await page.getByRole('button',{name,exact:true}).click()
        await settle()
      }
      await visit('/app/reports')
      for(const name of ['Last 7 days','Last 90 days','Last 30 days']) {
        await page.getByRole('button',{name,exact:true}).click()
        await settle()
      }
      return {dealFilters:8,reportPeriods:3}
    })
    await check('Views: dashboard calendar', async () => {
      await visit('/app/dashboard')
      for(const [name,view] of [['Week','timeGridWeek'],['Day','timeGridDay'],['Agenda','listWeek'],['Month','dayGridMonth']]) {
        await page.getByRole('button',{name,exact:true}).click()
        await settle()
        await page.locator(`.fc-${view}-view`).waitFor()
      }
      return {calendarViews:4}
    })
    if(stage.startsWith('after')) await check('Corrections: real pick queue and accounting downloads', async () => {
      const get=async path=>{
        const response=await context.request.get(`${web}${path}`)
        assert.equal(response.status(),200,path)
        return response
      }
      const board=(await (await get('/api/supplier/deliveries/board')).json()).data
      const pickable=board.orders.find(row=>['ACKNOWLEDGED','PROCESSING'].includes(row.orderStatus) && row.scheduledAt)
      assert.ok(pickable,'Prepared order fixture is required')
      const date=pickable.scheduledAt.slice(0,10)
      const sheet=(await (await get(`/api/supplier/run-sheet?date=${date}`)).json()).data
      assert.ok(sheet.ordersToPick.orders.some(row=>row.orderId===pickable.orderId),'Prepared order was hidden from the pick queue')
      assert.ok(Array.isArray(sheet.summary.receivablesByCurrency))
      assert.ok(Array.isArray(sheet.receivablesDueToday.summary.byCurrency))
      for(const path of ['/api/supplier/invoices/export.csv','/api/supplier/payments/export.csv','/api/supplier/accounting/summary.csv']) {
        const csv=await (await get(path)).text()
        assert.ok(csv.split(/\r?\n/)[0].includes('Currency'))
        assert.ok(!csv.includes('GMT+'))
      }
      await visit('/app/run-sheet')
      await page.locator('main input[type="date"]').fill(date)
      await settle()
      assert.ok((await page.locator('main').innerText()).includes('Orders to pick'))
      return {pickQueueCount:sheet.ordersToPick.count,preparedOrderVisible:true,accountingDownloads:3}
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
