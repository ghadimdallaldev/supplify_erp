import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Quick lists', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('restaurant can open quick lists', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    await page.goto('/app/quick-lists', { waitUntil: 'domcontentloaded' })
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Quick lists redirected')
    }
    const loaded = page
      .getByTestId('quick-lists-page')
      .or(page.getByRole('heading', { name: /quick list|ordering list/i }))
      .or(page.getByText(/ordering lists|quick lists/i))
    await expect(loaded.first()).toBeVisible({ timeout: 15000 })
  })
})
