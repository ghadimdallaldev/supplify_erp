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
    await dashboardPage.goto()
    await dashboardPage.expectDashboardLoaded()
    await expect(dashboardPage.sidebar).toBeVisible()
  })

  test('logout clears session and shows login', async ({ page, dashboardPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    await dashboardPage.goto()
    await dashboardPage.expectDashboardLoaded()
    await page.getByTestId('logout-button').click()
    await page.waitForURL(/\/login/, { timeout: 10000 })
    await expect(page.getByTestId('login-page')).toBeVisible()
  })
})
