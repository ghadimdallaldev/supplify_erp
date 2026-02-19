import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Catalog', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'catalog_basic' })
  })

  test('restaurant can open products page', async ({ productsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')
    await productsPage.goto()
    await productsPage.expectProductsPageLoaded()
  })

  test('supplier can open products page', async ({ productsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')
    await productsPage.goto()
    await productsPage.expectProductsPageLoaded()
  })

  test('restaurant can search and add product to cart', async ({
    page,
    productsPage,
    cartPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')
    await productsPage.goto()
    await productsPage.expectProductsPageLoaded()
    const addButton = page.locator('[data-testid^="product-add-to-cart-"]').first()
    await addButton.waitFor({ state: 'visible', timeout: 15000 })
    const testId = await addButton.getAttribute('data-testid')
    const productId = testId?.replace('product-add-to-cart-', '') ?? ''
    await addButton.click()
    await expect(page.getByText('Added to cart')).toBeVisible({ timeout: 5000 })
    await page.goto('/app/cart', { waitUntil: 'domcontentloaded' })
    await cartPage.expectCartPageLoaded()
    if (productId) {
      await expect(cartPage.cartItemRow(productId)).toBeVisible({ timeout: 10000 })
    } else {
      await expect(cartPage.placeOrderButton).toBeVisible()
    }
  })
})
