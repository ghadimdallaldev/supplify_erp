import { test, expect } from '@playwright/test'
import { walkSupplier, walkRestaurant } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/demo/events', (route) => route.fulfill({ status: 204 }))
})

test('public aliases preserve the QR attribution and use the main web demo entry', async ({
  page,
  request,
}) => {
  for (const alias of ['/demo', '/horeca', '/horeca/']) {
    const response = await request.get(`${alias}?utm_source=qr`, { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe('/demo/?utm_source=qr')
  }
  await page.goto('/horeca?utm_source=qr&utm_content=supplier&role=supplier')
  await expect(page).toHaveURL(/\/demo\/\?utm_source=qr&utm_content=supplier&role=supplier$/)
  await expect(page.locator('#sim-supplier')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Every order, one line.' })).toBeVisible()
})

test('video supports range requests and actually plays', async ({ page, request }) => {
  const response = await request.get('/demo/assets/media/supplify-film-web.mp4', {
    headers: { Range: 'bytes=0-1023' },
  })
  expect(response.status()).toBe(206)
  expect(response.headers()['content-type']).toContain('video/mp4')
  await page.goto('/demo/')
  await page.getByRole('button', { name: /Get the whole picture in 60 seconds/ }).click()
  await expect
    .poll(() =>
      page.locator('#film video[controls]').evaluate((v: HTMLVideoElement) => v.currentTime)
    )
    .toBeGreaterThan(0)
})

test('demo request is anonymous even with an existing ERP cookie', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: 'access_token', value: 'existing-session', url: baseURL! }])
  let submitted: Record<string, unknown> | undefined
  await page.route('**/api/public/demo/leads', async (route) => {
    expect((await route.request().allHeaders()).cookie).toBeUndefined()
    expect((await route.request().allHeaders()).authorization).toBeUndefined()
    submitted = route.request().postDataJSON()
    await route.fulfill({ json: { ok: true } })
  })
  await page.goto('/demo/?utm_source=qr&utm_content=restaurant')
  await page.getByRole('button', { name: 'Request a personal demo' }).first().click()
  const form = page.getByTestId('demo-form')
  await form.locator('.role-pick label', { hasText: 'Restaurant' }).click()
  await form.getByLabel('Your name').fill('Demo Visitor')
  await form.getByLabel('Restaurant or group').fill('Example Bistro')
  await form.getByLabel('WhatsApp number').fill('71 123 456')
  await form.getByLabel(/how many locations/).selectOption('2-5')
  await form.getByLabel(/I agree/).check()
  await form.getByRole('button', { name: 'Request a personal demo' }).click()
  await expect(page.getByTestId('demo-success')).toContainText('Nothing is scheduled yet')
  expect(submitted).toMatchObject({ consent: true, utm_source: 'qr', qr_variant: 'restaurant' })
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token')).toBe(true)
})

for (const width of [1440, 1024, 820, 390, 360]) {
  test(`all real screens fit at ${width}px and role shortcuts work`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/demo/')
    for (const role of ['supplier', 'restaurant']) {
      await page
        .getByRole('button', {
          name: `I’m a ${role === 'supplier' ? 'Supplier' : 'Restaurant'}, explore the walkthrough`,
          exact: true,
        })
        .click()
      await expect(page.locator(`#sim-${role}`)).toBeVisible()
      await page
        .getByRole('button', {
          name: role === 'supplier' ? 'Supplier side' : 'Restaurant side',
          exact: true,
        })
        .click()
      const tabs = page.locator('.viewer-tabs button')
      for (let i = 0; i < (await tabs.count()); i++) {
        await tabs.nth(i).click()
        const image = page.locator('.viewer-stage img')
        await expect
          .poll(() =>
            image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
          )
          .toBe(true)
        const fits = await image.evaluate(
          (img) =>
            img.clientWidth <= img.parentElement!.clientWidth &&
            getComputedStyle(img).objectFit === 'contain'
        )
        expect(fits).toBe(true)
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await page.getByRole('button', { name: 'Enlarge screen', exact: true }).click()
    await expect(page.locator('.lightbox[open] img')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.lightbox[open]')).toHaveCount(0)
  })
}

test('campaign lead page uses Supplify authentication', async ({ page }) => {
  await page.route('**/api/admin-dashboard/demo/leads', (route) =>
    route.fulfill({ status: 401, json: { ok: false } })
  )
  await page.goto('/demo/admin/')
  await expect(page.getByRole('heading', { name: 'Campaign admin' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
    'href',
    '/login'
  )
  await expect(page.locator('.admin-leads')).toHaveCount(0)
})

test('both seven-step walkthroughs finish on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/demo/')
  await walkSupplier(page)
  await expect(page.locator('.sim-stepname')).toContainText('Step 7 of 7')
  await page.goto('/demo/')
  await walkRestaurant(page)
  await expect(page.locator('.after')).toContainText('one line')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})
