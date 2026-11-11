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

for (const format of ['landscape', 'portrait'] as const) {
  test(`${format} v3 film plays with the matching composition and captions`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(
      format === 'portrait' ? { width: 390, height: 844 } : { width: 1440, height: 900 }
    )
    const film = `/demo/assets/media/supplify-film-v3-${format}.mp4`
    const response = await request.get(film, { headers: { Range: 'bytes=0-1023' } })
    expect(response.status()).toBe(206)
    expect(response.headers()['content-type']).toContain('video/mp4')
    const mediaRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().endsWith('.mp4')) mediaRequests.push(req.url())
    })
    await page.goto('/demo/')
    const video = page.locator('#film video')
    await expect(video).toHaveAttribute('src', film)
    await expect(video).toHaveAttribute(
      'poster',
      `/demo/assets/media/supplify-film-v3-${format}.jpg`
    )
    await expect(video).toHaveAttribute('preload', 'none')
    expect(mediaRequests).toEqual([])
    expect(await page.locator('main').evaluate((main) => main.children[2].id)).toBe('film')
    await page.getByRole('button', { name: /Get the whole picture in 60 seconds/ }).click()
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0)
    const info = await video.evaluate((v: HTMLVideoElement) => ({
      width: v.videoWidth,
      height: v.videoHeight,
      duration: v.duration,
      fit: getComputedStyle(v).objectFit,
      muted: v.muted,
    }))
    expect(info.width / info.height).toBeCloseTo(format === 'portrait' ? 9 / 16 : 16 / 9, 2)
    expect(info.duration).toBeCloseTo(60, 1)
    expect(info.fit).toBe('contain')
    expect(info.muted).toBe(false)
    expect(mediaRequests.every((url) => url.endsWith(film))).toBe(true)
    await video.evaluate((v: HTMLVideoElement) => {
      v.textTracks[0].mode = 'hidden'
    })
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.textTracks[0].cues?.length || 0))
      .toBeGreaterThan(20)
    expect(
      await video.evaluate((v: HTMLVideoElement) => (v.textTracks[0].cues![0] as VTTCue).text)
    ).toBe('Running a restaurant means chasing orders.')
    await page
      .locator('#film')
      .screenshot({ path: `test-results/demo-film-v3/${format}-playing.png` })
  })
}

test('film adapts before play and retains its position when a phone rotates during playback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/demo/')
  const video = page.locator('#film video')
  await expect(video).toHaveAttribute('src', /v3-portrait\.mp4$/)
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(video).toHaveAttribute('src', /v3-landscape\.mp4$/)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(video).toHaveAttribute('src', /v3-portrait\.mp4$/)
  await page.getByRole('button', { name: 'Play the film', exact: true }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0)
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 20
  })
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(video).toHaveAttribute('src', /v3-portrait\.mp4$/)
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThanOrEqual(20)
  const frame = await page.locator('.film-frame').boundingBox()
  expect(frame!.height).toBeLessThanOrEqual(390 * 0.8)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})

test('a film network failure can be retried without blocking the demo', async ({ page }) => {
  const film = '**/supplify-film-v3-landscape.mp4'
  await page.route(film, (route) => route.abort())
  await page.goto('/demo/')
  await page.getByRole('button', { name: 'Play the film', exact: true }).click()
  await expect(page.locator('.film-error')).toContainText('The film could not load')
  await page.unroute(film)
  await page.getByRole('button', { name: 'Try the film again', exact: true }).click()
  await expect
    .poll(() => page.locator('#film video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0)
  await expect(page.locator('.film-error')).toHaveCount(0)
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
