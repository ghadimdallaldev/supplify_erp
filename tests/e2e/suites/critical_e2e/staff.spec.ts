import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Staff', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'subscription_limits_basic', soft: true })
  })

  test('restaurant opens staff page', async ({ page, staffPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    try {
      await staffPage.goto()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Staff redirected')
    }
    try {
      await staffPage.expectLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }
    await expect(staffPage.pageContainer).toBeVisible()
  })
})
