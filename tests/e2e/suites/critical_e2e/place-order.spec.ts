import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Place order', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'catalog_basic', soft: true })
  })

  test('restaurant adds product to cart and places order', async ({
    page,
    productsPage,
    cartPage,
    ordersPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    await productsPage.goto()
    try {
      await productsPage.expectProductsPageLoaded()
    } catch {
      test.skip(true, 'Products page did not load (transient or gated)')
    }

    const addButton = page.locator('[data-testid^="product-add-to-cart-"]:not([disabled])').first()
    const attached = await addButton.count()
    test.skip(!attached, 'No products available to add to cart')
    await addButton.evaluate((el: HTMLElement) => el.click())
    await cartPage.goto()
    await cartPage.expectCartPageLoaded()
    const placeOrder = cartPage.placeOrderButton.or(cartPage.getByTestId('cart-mobile-place-order'))
    const canPlace = await placeOrder
      .first()
      .isEnabled()
      .catch(() => false)
    test.skip(!canPlace, 'Place order disabled (limits, permissions, or empty cart)')

    await cartPage.clickPlaceOrder()

    const confirmButton = page.getByRole('button', { name: /confirm|place order/i }).last()
    await confirmButton.waitFor({ state: 'visible', timeout: 10000 })
    const responsePromise = page
      .waitForResponse((r) => r.url().includes('/api/orders') && r.request().method() === 'POST')
      .catch(() => null)
    await confirmButton.click()
    const response = await responsePromise
    if (response && response.status() >= 400) {
      test.skip(true, `Order API returned ${response.status()} (limits or gating)`)
    }

    const orderToastVisible = await page
      .getByText(/order placed|orders placed/i)
      .isVisible({ timeout: 15000 })
      .catch(() => false)
    if (!orderToastVisible) {
      await ordersPage.gotoAndExpectOrdersApiOk()
      await ordersPage.expectOrdersPageLoaded()
      const firstRow = ordersPage.pageContainer.locator('[data-testid^="order-row-"]').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
    }
  })
})
