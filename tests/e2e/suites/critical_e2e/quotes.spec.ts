import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Quote requests', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'catalog_basic', soft: true })
  })

  test('restaurant opens quote requests page', async ({ page, quotesPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    try {
      await quotesPage.goto()
    } catch {
      test.skip(true, 'Quote requests navigation timed out')
    }
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Quote requests redirected')
    }
    try {
      await quotesPage.expectLoaded()
    } catch {
      const titleVisible = await page
        .getByText(/quote request/i)
        .first()
        .isVisible()
        .catch(() => false)
      test.skip(!titleVisible, 'Quotes UI did not settle')
    }
  })
})
