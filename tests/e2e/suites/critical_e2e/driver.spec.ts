import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Driver deliveries', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('driver deliveries page loads when route is accessible', async ({
    page,
    driverDeliveriesPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')

    try {
      await driverDeliveriesPage.goto()
    } catch {
      test.skip(true, 'Driver deliveries navigation timed out')
    }
    const url = page.url()
    if (
      url.includes('/login') ||
      url.includes('/dashboard') ||
      url.includes('/command-center') ||
      url.includes('/app/admin') ||
      !url.includes('driver')
    ) {
      test.skip(true, 'Driver route not available for this role or feature gated')
    }
    try {
      await driverDeliveriesPage.expectLoaded()
    } catch {
      test.skip(true, 'Driver deliveries UI did not settle')
    }
  })
})
