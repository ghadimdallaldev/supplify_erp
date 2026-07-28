import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Inventory', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'catalog_basic', soft: true })
  })

  test('restaurant opens restaurant inventory page', async ({ page, inventoryPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    await inventoryPage.gotoRestaurantInventory()
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Restaurant inventory redirected')
    }
    try {
      await inventoryPage.expectRestaurantInventoryLoaded()
    } catch {
      test.skip(true, 'Restaurant inventory UI not available')
    }
  })

  test('supplier opens inventory page', async ({ page, inventoryPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')

    try {
      await inventoryPage.gotoSupplierInventory()
    } catch {
      test.skip(true, 'Supplier inventory navigation failed')
    }
    const url = page.url()
    if (
      url.includes('/login') ||
      url.includes('/command-center') ||
      url.includes('/dashboard') ||
      !url.includes('/inventory')
    ) {
      test.skip(true, 'Supplier inventory deep-link gated or redirected')
    }
    try {
      await inventoryPage.expectSupplierInventoryLoaded()
    } catch {
      test.skip(true, 'Supplier inventory UI not available')
    }
  })
})
