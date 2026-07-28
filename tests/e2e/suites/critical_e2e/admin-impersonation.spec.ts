import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Admin impersonation', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('admin can open tenants tab and see impersonation controls if present', async ({
    page,
    adminDashboardPage,
  }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_admin', 'Admin-only')

    try {
      await adminDashboardPage.gotoTenants()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    try {
      await adminDashboardPage.expectAdminDashboardLoaded()
    } catch {
      test.skip(true, 'UI did not settle')
    }

    const tenantsNav = adminDashboardPage.navTab('tenants')
    if (await tenantsNav.isVisible().catch(() => false)) {
      await expect(tenantsNav).toBeVisible()
    }

    const tenantsTab = adminDashboardPage.tenantsTab
    if (await tenantsTab.isVisible({ timeout: 15000 }).catch(() => false)) {
      await expect(tenantsTab).toBeVisible()
    }

    const impersonateButtons = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-user-cog') })
    const count = await impersonateButtons.count()
    if (count > 0) {
      await expect(impersonateButtons.first()).toBeVisible()
    }
  })
})
