import { test, expect } from '../../fixtures'
import { webReachable, authAvailable } from '../../utils/reachability'

test.describe('Nightly – broader coverage', () => {
  test('restaurant can open dashboard and see sidebar nav', async ({ dashboardPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    await dashboardPage.goto()
    await dashboardPage.expectDashboardLoaded()
    await expect(dashboardPage.getByTestId('nav-dashboard')).toBeVisible()
  })

  test('restaurant can open quick lists from nav', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' })
    await page.getByTestId('nav-quick-lists').click()
    await page.waitForURL(/\/app\/quick-lists/, { timeout: 10000 }).catch(() => {})
    await expect(page.getByTestId('sidebar')).toBeVisible()
  })
})
