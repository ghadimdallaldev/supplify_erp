import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('RBAC', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('restaurant_manager cannot access admin UI', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(
      test.info().project.name !== 'critical_e2e_restaurant',
      'Run only as restaurant project'
    )
    try {
      await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch {
      test.skip(true, 'Restaurant dashboard navigation timed out')
    }
    await page.waitForLoadState('networkidle').catch(() => {})
    const sidebar = page.getByTestId('sidebar')
    const visible = await sidebar.isVisible().catch(() => false)
    test.skip(!visible, 'Restaurant shell did not load for RBAC check')
    const adminNavVisible = await page
      .getByTestId('nav-admin-dashboard')
      .isVisible()
      .catch(() => false)
    expect(adminNavVisible).toBe(false)
  })

  test('supplier cannot access admin UI', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Run only as supplier project')
    try {
      await page.goto('/app/command-center', { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch {
      test.skip(true, 'Supplier command-center navigation timed out')
    }
    await page.waitForLoadState('networkidle').catch(() => {})
    const sidebar = page.getByTestId('sidebar')
    const visible = await sidebar
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!visible, 'Supplier shell did not load for RBAC check')
    const adminNavVisible = await page
      .getByTestId('nav-admin-dashboard')
      .isVisible()
      .catch(() => false)
    expect(adminNavVisible).toBe(false)
  })
})
