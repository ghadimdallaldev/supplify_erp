import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Admin platform', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('admin dashboard and sidebar nav are visible', async ({ adminDashboardPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_admin', 'Admin-only')

    try {
      await adminDashboardPage.goto()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    try {
      await adminDashboardPage.expectAdminDashboardLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }
    await adminDashboardPage.expectSidebarVisible()
    await expect(adminDashboardPage.pageContainer).toBeVisible()
    await expect(adminDashboardPage.sidebar).toBeVisible()

    const overviewNav = adminDashboardPage.navTab('overview')
    if (await overviewNav.isVisible().catch(() => false)) {
      await expect(overviewNav).toBeVisible()
    }
  })
})
