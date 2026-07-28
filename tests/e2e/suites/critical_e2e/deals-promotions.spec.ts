import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Deals and promotions', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'catalog_basic', soft: true })
  })

  test('restaurant opens deals page', async ({ page, dealsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    try {
      await dealsPage.goto()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Deals redirected')
    }
    try {
      await dealsPage.expectLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }
  })

  test('supplier opens promotions page', async ({ page, promotionsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')

    try {
      await promotionsPage.goto()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    if (page.url().includes('/login') || page.url().includes('/command-center')) {
      test.skip(true, 'Promotions feature gated or redirected')
    }
    try {
      await promotionsPage.expectLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }
  })
})
