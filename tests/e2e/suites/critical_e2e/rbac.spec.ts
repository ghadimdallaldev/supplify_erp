import { test, expect } from '../../fixtures'
import { webReachable, authAvailable } from '../../utils/reachability'

test.describe('RBAC', () => {
  test('restaurant_manager cannot access admin UI', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    test.skip(
      test.info().project.name !== 'critical_e2e_restaurant',
      'Run only as restaurant project'
    )
    await page.goto('/app/admin', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    const adminVisible = await page
      .getByTestId('admin-dashboard-page')
      .isVisible()
      .catch(() => false)
    expect(adminVisible).toBe(false)
  })

  test('supplier cannot access admin UI', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    test.skip(!authAvailable(), 'Keycloak/auth not available')
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Run only as supplier project')
    await page.goto('/app/admin', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    const adminVisible = await page
      .getByTestId('admin-dashboard-page')
      .isVisible()
      .catch(() => false)
    expect(adminVisible).toBe(false)
  })
})
