import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, authAvailable } from '../../utils/reachability'

test.describe('Orders flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'orders_basic' })
  })

  test('restaurant can open orders and navigate to cart', async ({
    page,
    ordersPage,
    cartPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')
    await ordersPage.goto()
    await ordersPage.expectOrdersPageLoaded()
    await page.getByTestId('orders-create-new-order').click()
    await page.waitForURL(/\/app\/cart/, { timeout: 10000 })
    await cartPage.expectCartPageLoaded()
  })

  test('supplier sees orders inbox', async ({ page, ordersPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')
    await ordersPage.goto()
    await ordersPage.expectOrdersPageLoaded()
    await expect(ordersPage.pageContainer).toBeVisible()
  })

  test('supplier fulfills order: acknowledge -> processing -> ship -> deliver', async ({
    page,
    ordersPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')
    const { E2E_ORDER_ID } = await import('../../../test-data/factory')
    await ordersPage.goto()
    await ordersPage.expectOrdersPageLoaded()
    const orderRow = ordersPage.orderRow(E2E_ORDER_ID)
    await orderRow.waitFor({ state: 'visible', timeout: 15000 })
    await ordersPage.orderActionAcknowledge(E2E_ORDER_ID).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await orderRow.waitFor({ state: 'visible', timeout: 5000 })
    await ordersPage.getByTestId(`order-${E2E_ORDER_ID}-start-processing`).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await orderRow.waitFor({ state: 'visible', timeout: 5000 })
    await ordersPage.orderActionShip(E2E_ORDER_ID).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await ordersPage.orderActionDeliver(E2E_ORDER_ID).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await expect(orderRow.getByText('DELIVERED')).toBeVisible({ timeout: 10000 })
  })

  test('supplier can decline (cancel) PLACED order', async ({ page, ordersPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')
    const { E2E_ORDER_ID } = await import('../../../test-data/factory')
    await ordersPage.goto()
    await ordersPage.expectOrdersPageLoaded()
    const orderRow = ordersPage.orderRow(E2E_ORDER_ID)
    await orderRow.waitFor({ state: 'visible', timeout: 15000 })
    await ordersPage.getByTestId(`order-${E2E_ORDER_ID}-decline`).click()
    await page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 200)
      .catch(() => {})
    await expect(orderRow.getByText('CANCELLED')).toBeVisible({ timeout: 10000 })
  })

  test('restaurant sees delivered order', async ({ request, ordersPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')
    const { E2E_ORDER_ID } = await import('../../../test-data/factory')
    await resetAndSeed(request, { scenario: 'orders_delivered' })
    await ordersPage.goto()
    await ordersPage.expectOrdersPageLoaded()
    const orderRow = ordersPage.orderRow(E2E_ORDER_ID)
    await orderRow.waitFor({ state: 'visible', timeout: 15000 })
    await expect(orderRow.getByText('DELIVERED')).toBeVisible()
  })
})
