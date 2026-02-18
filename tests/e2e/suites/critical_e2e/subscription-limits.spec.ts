import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, authAvailable } from '../../utils/reachability'

test.describe('Subscription limits', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'subscription_limits_basic' })
  })

  test('authenticated user can reach app (subscription context loads)', async ({
    dashboardPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    await dashboardPage.goto()
    await dashboardPage.expectDashboardLoaded()
    await expect(dashboardPage.sidebar).toBeVisible()
  })
})
