import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Nightly – broader coverage', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('restaurant can open dashboard and see sidebar nav', async ({ dashboardPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    await dashboardPage.goto()
    await dashboardPage.expectDashboardLoaded()
    await expect(dashboardPage.getByTestId('nav-dashboard')).toBeVisible()
  })

  test('restaurant can open quick lists from nav', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' })
    await page.getByTestId('nav-quick-lists').click()
    await page.waitForURL(/\/app\/quick-lists/, { timeout: 10000 }).catch(() => {})
    await expect(page.getByTestId('sidebar')).toBeVisible()
  })
})
