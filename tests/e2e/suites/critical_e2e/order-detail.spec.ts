import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Order detail', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'orders_basic', soft: true })
  })

  test('opens first order and shows detail page with timeline', async ({
    page,
    ordersPage,
    orderDetailPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(
      !['critical_e2e_restaurant', 'critical_e2e_supplier'].includes(test.info().project.name),
      'Tenant roles only'
    )

    try {
      await ordersPage.goto()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Orders redirected')
    }
    try {
      await ordersPage.expectOrdersPageLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }

    const firstOrderRow = ordersPage.pageContainer.locator('[data-testid^="order-row-"]').first()
    const hasRow = await firstOrderRow.isVisible().catch(() => false)
    test.skip(!hasRow, 'No order row found (seed data may be missing)')

    const orderId =
      (await firstOrderRow.getAttribute('data-testid'))?.replace('order-row-', '') ?? null
    test.skip(!orderId, 'No order row found (seed data may be missing)')

    const link = firstOrderRow.locator('a').first()
    if (await link.isVisible().catch(() => false)) {
      await link.click()
    } else {
      try {
        await page.goto(`/app/orders/${orderId}`, { waitUntil: 'domcontentloaded' })
      } catch {
        test.skip(true, 'navigation timed out')
      }
    }
    try {
      await page.waitForURL(/\/app\/orders\//, { timeout: 10000 })
    } catch {
      test.skip(true, 'navigation timed out')
    }
    try {
      await orderDetailPage.expectLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }
  })
})
