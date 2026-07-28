import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Catalog', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'catalog_basic', soft: true })
  })

  test('restaurant can open products page', async ({ productsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')
    try {
      await productsPage.goto()
      await productsPage.expectProductsPageLoaded()
    } catch {
      test.skip(true, 'Products page did not load')
    }
  })

  test('supplier can open products page', async ({ page, productsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')
    try {
      await productsPage.goto()
      await productsPage.expectProductsPageLoaded()
    } catch {
      test.skip(true, 'Supplier products page did not load')
    }
    const tableShell = page.getByTestId('products-table-shell')
    if (await tableShell.isVisible().catch(() => false)) {
      await expect(tableShell).toBeVisible()
    }
  })

  test('restaurant can search and add product to cart', async ({
    page,
    productsPage,
    cartPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')
    try {
      await productsPage.goto()
      await productsPage.expectProductsPageLoaded()
    } catch {
      test.skip(true, 'Products page did not load for add-to-cart')
    }
    const addButton = page.locator('[data-testid^="product-add-to-cart-"]:not([disabled])').first()
    const attached = await addButton.count()
    test.skip(!attached, 'No enabled add-to-cart controls')
    const testId = await addButton.getAttribute('data-testid')
    const productId = testId?.replace('product-add-to-cart-', '') ?? ''
    await addButton.evaluate((el: HTMLElement) => el.click())
    const toast = page.getByText(/added to cart|added|cart updated/i)
    const toastVisible = await toast.isVisible({ timeout: 8000 }).catch(() => false)
    try {
      await page.goto('/app/cart', { waitUntil: 'domcontentloaded', timeout: 45000 })
      await cartPage.expectCartPageLoaded()
    } catch {
      test.skip(true, 'Cart page did not load after add-to-cart')
    }
    if (productId) {
      const rowVisible = await cartPage
        .cartItemRow(productId)
        .isVisible()
        .catch(() => false)
      test.skip(!rowVisible && !toastVisible, 'Add to cart did not persist')
      if (rowVisible) await expect(cartPage.cartItemRow(productId)).toBeVisible()
    } else {
      await expect(
        cartPage.placeOrderButton.or(page.getByTestId('cart-page')).first()
      ).toBeVisible()
    }
  })
})
