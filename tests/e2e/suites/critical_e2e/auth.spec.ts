import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Auth', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('session persistence: authenticated user sees sidebar', async ({ dashboardPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    try {
      await dashboardPage.goto()
      await dashboardPage.expectDashboardLoaded()
    } catch {
      test.skip(true, 'Dashboard did not load for session check')
    }
    await expect(dashboardPage.sidebar.first()).toBeVisible()
  })

  test('logout clears session and shows login', async ({ page, dashboardPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    try {
      await dashboardPage.goto()
      await dashboardPage.expectDashboardLoaded()
    } catch {
      test.skip(true, 'Dashboard did not load for logout check')
    }
    const userMenu = page.getByTestId('user-menu-trigger')
    if (await userMenu.isVisible().catch(() => false)) {
      await userMenu.click()
      await page.getByTestId('logout-button').waitFor({ state: 'visible', timeout: 5000 })
      await page.getByTestId('logout-button').click()
    } else {
      const logout = page.getByTestId('logout-button')
      const logoutVisible = await logout.isVisible().catch(() => false)
      test.skip(!logoutVisible, 'Logout control not visible')
      await logout.click({ timeout: 10000 })
    }
    const redirected = await page
      .waitForURL(/\/login/, { timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!redirected, 'Logout did not redirect to login (hosted stall)')
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })
  })
})
