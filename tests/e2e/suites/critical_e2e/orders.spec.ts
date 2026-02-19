import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Orders flow', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'orders_basic' })
  })

  test('restaurant can open orders and navigate to cart', async ({
    page,
    ordersPage,
    cartPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')
    await ordersPage.gotoAndExpectOrdersApiOk()
    await ordersPage.expectOrdersPageLoaded()
    await page.getByTestId('orders-create-new-order').click()
    await page.waitForURL(/\/app\/cart/, { timeout: 10000 })
    await cartPage.expectCartPageLoaded()
  })

  test('supplier sees orders inbox', async ({ page, ordersPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')
    await ordersPage.gotoAndExpectOrdersApiOk()
    await ordersPage.expectOrdersPageLoaded()
    await expect(ordersPage.pageContainer).toBeVisible()
  })

  test('supplier fulfills order: acknowledge -> processing -> ship -> deliver', async ({
    page,
    ordersPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')
    await ordersPage.gotoAndExpectOrdersApiOk()
    await ordersPage.expectOrdersPageLoaded()
    const firstOrderRow = ordersPage.pageContainer.locator('[data-testid^="order-row-"]').first()
    await firstOrderRow.waitFor({ state: 'visible', timeout: 15000 })
    const orderId =
      (await firstOrderRow.getAttribute('data-testid'))?.replace('order-row-', '') ?? null
    test.skip(!orderId, 'No order row found (seed data may be missing)')
    const orderRow = ordersPage.orderRow(orderId)
    await orderRow.waitFor({ state: 'visible', timeout: 15000 })
    await ordersPage.orderActionAcknowledge(orderId).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await orderRow.waitFor({ state: 'visible', timeout: 5000 })
    await ordersPage.getByTestId(`order-${orderId}-start-processing`).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await orderRow.waitFor({ state: 'visible', timeout: 5000 })
    await ordersPage.orderActionShip(orderId).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await ordersPage.orderActionDeliver(orderId).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await expect(orderRow.getByText('DELIVERED')).toBeVisible({ timeout: 10000 })
  })

  test('supplier can decline (cancel) PLACED order', async ({ page, ordersPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')
    await ordersPage.gotoAndExpectOrdersApiOk()
    await ordersPage.expectOrdersPageLoaded()
    const firstOrderRow = ordersPage.pageContainer.locator('[data-testid^="order-row-"]').first()
    await firstOrderRow.waitFor({ state: 'visible', timeout: 15000 })
    const orderId =
      (await firstOrderRow.getAttribute('data-testid'))?.replace('order-row-', '') ?? null
    test.skip(!orderId, 'No order row found (seed data may be missing)')
    const orderRow = ordersPage.orderRow(orderId)
    await ordersPage.getByTestId(`order-${orderId}-decline`).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await expect(orderRow.getByText('CANCELLED')).toBeVisible({ timeout: 10000 })
  })

  test('restaurant sees delivered order', async ({ request, ordersPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')
    await resetAndSeed(request, { scenario: 'orders_delivered' })
    await ordersPage.gotoAndExpectOrdersApiOk()
    await ordersPage.expectOrdersPageLoaded()
    const firstOrderRow = ordersPage.pageContainer.locator('[data-testid^="order-row-"]').first()
    await firstOrderRow.waitFor({ state: 'visible', timeout: 15000 })
    const orderId =
      (await firstOrderRow.getAttribute('data-testid'))?.replace('order-row-', '') ?? null
    test.skip(!orderId, 'No order row found (seed data may be missing)')
    const orderRow = ordersPage.orderRow(orderId)
    await expect(orderRow.getByText('DELIVERED')).toBeVisible()
  })
})
