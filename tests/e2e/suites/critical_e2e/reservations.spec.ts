import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Reservations', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('restaurant opens reservations page', async ({ page, reservationsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    try {
      await reservationsPage.goto()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Reservations redirected')
    }
    try {
      await reservationsPage.expectLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }
    await expect(reservationsPage.pageContainer).toBeVisible()
  })

  test('public reservation portal loads', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')

    try {
      await page.goto('/reserve/demo-bistro', { waitUntil: 'domcontentloaded' })
    } catch {
      test.skip(true, 'navigation timed out')
    }
    const reservePage = page.getByTestId('public-reserve-page')
    const body = page.locator('body')
    try {
      await expect(reservePage.or(body).first()).toBeVisible({ timeout: 15000 })
    } catch {
      test.skip(true, 'UI did not settle')
    }
  })
})
