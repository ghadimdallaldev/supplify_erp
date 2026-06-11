import { test, expect } from '../../fixtures'
import { webReachable } from '../../utils/reachability'

test.describe('Consumer ordering (B2C)', () => {
  test('storefront loads for a restaurant slug', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    await page.goto('/order/demo-bistro', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible()
    const url = page.url()
    expect(url).toMatch(/\/order\/demo-bistro/)
  })

  test('track order page loads without login', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    await page.goto('/order/demo-bistro/track', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible()
    const url = page.url()
    expect(url).toMatch(/\/order\/demo-bistro\/track/)
  })

  test('account page shows login and signup', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    await page.goto('/order/demo-bistro/account', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /sign in|log in/i }).first()).toBeVisible({
      timeout: 10000,
    })
  })
})
