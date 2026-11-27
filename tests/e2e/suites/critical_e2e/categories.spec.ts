import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Platform categories and shelves', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'catalog_basic', soft: true })
  })

  test('restaurant browses Bakery → Bread across suppliers', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    await page.goto('/app/products')
    const browse = page.getByTestId('category-browse')
    await expect(browse).toBeVisible()

    const bakery = browse.getByRole('link', { name: /Bakery/ })
    test.skip(!(await bakery.count()), 'Seed has no visible bakery products')
    await bakery.first().click()
    await expect(page).toHaveURL(/\/app\/shop\/category\/dept-bakery-pastry$/)

    await page
      .getByRole('navigation', { name: /categories/i })
      .getByRole('link', { name: /^Bakery & Bread/ })
      .click()
    await expect(page).toHaveURL(/\/app\/shop\/category\/bakery-bread$/)
    await expect(page.getByRole('heading', { name: 'Bakery & Bread' })).toBeVisible()

    // Either products from one or more suppliers, or the request-a-quote empty state.
    const results = page.getByTestId('category-results')
    const empty = page.getByText('No suppliers sell this yet')
    await expect(results.or(empty)).toBeVisible()
    if (await results.isVisible()) {
      await expect(results.locator('[data-testid^="category-product-"]').first()).toBeVisible()
    }
  })

  test('supplier adds product, accepts suggested category, puts it on a shelf', async ({
    page,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')

    const shelfName = `E2E shelf ${Date.now()}`
    const sku = `E2E-SOUR-${Date.now()}`

    await page.goto('/app/products')
    await page.getByRole('button', { name: /Shelves/ }).click()
    const shelves = page.getByRole('dialog')
    await shelves.getByLabel(/Shelf name/).fill(shelfName)
    await shelves.getByRole('button', { name: /Add shelf/ }).click()
    await expect(shelves.getByText(shelfName)).toBeVisible()
    await page.keyboard.press('Escape')

    await page
      .getByRole('button', { name: /Add Product/ })
      .first()
      .click()
    const form = page.getByRole('dialog')
    await form.getByLabel(/Product Name/).fill('Sourdough loaf')
    await form.getByLabel(/^SKU/).fill(sku)
    await expect(form.getByRole('combobox', { name: /category/i })).toContainText('Bread', {
      timeout: 5_000,
    })
    await form.getByRole('button', { name: new RegExp(shelfName) }).click()
    await form.getByLabel(/Price/).fill('4.5')
    await form.getByRole('button', { name: 'Create Product' }).click()
    await expect(form).toBeHidden()

    await page
      .getByPlaceholder(/Search/)
      .first()
      .fill(sku)
    await expect(page.getByText('Sourdough loaf').first()).toBeVisible()
  })
})
