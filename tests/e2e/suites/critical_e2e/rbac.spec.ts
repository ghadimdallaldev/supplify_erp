import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('RBAC', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('restaurant_manager cannot access admin UI', async ({ page, authStub }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(
      test.info().project.name !== 'critical_e2e_restaurant',
      'Run only as restaurant project'
    )
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 15000 })
    const adminNavVisible = await page
      .getByTestId('nav-admin-dashboard')
      .isVisible()
      .catch(() => false)
    expect(adminNavVisible).toBe(false)
  })

  test('supplier cannot access admin UI', async ({ page, authStub }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Run only as supplier project')
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 15000 })
    const adminNavVisible = await page
      .getByTestId('nav-admin-dashboard')
      .isVisible()
      .catch(() => false)
    expect(adminNavVisible).toBe(false)
  })
})
