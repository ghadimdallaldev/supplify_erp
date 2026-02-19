import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Subscription limits', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'subscription_limits_basic' })
  })

  test('authenticated user can reach app (subscription context loads)', async ({
    dashboardPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    await dashboardPage.goto()
    await dashboardPage.expectDashboardLoaded()
    await expect(dashboardPage.sidebar).toBeVisible()
  })
})
