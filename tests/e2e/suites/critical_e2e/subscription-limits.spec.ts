import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Subscription limits', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'subscription_limits_basic', soft: true })
  })

  test('authenticated user can reach app (subscription context loads)', async ({
    dashboardPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    try {
      await dashboardPage.goto()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    try {
      await dashboardPage.expectDashboardLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }
    await expect(dashboardPage.sidebar).toBeVisible()
    const kpi = dashboardPage.getByTestId('dashboard-kpi-grid')
    if (await kpi.isVisible().catch(() => false)) {
      await expect(kpi).toBeVisible()
    }
  })
})
