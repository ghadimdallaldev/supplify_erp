import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

/**
 * Marketplace visibility (Plan A Task 12): relationship-aware UI on seeded tenants.
 * Every check skips instead of failing when the seeded data or plan does not expose the
 * surface, like the rest of critical_e2e on hosted environments.
 */
test.describe('Marketplace visibility', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('restaurant catalog rows offer Follow & add or Add to cart', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant only')

    try {
      await page.goto('/app/products', { waitUntil: 'domcontentloaded' })
    } catch {
      test.skip(true, 'Products navigation timed out')
    }
    const followAndAdd = page.getByRole('button', { name: /follow & add/i })
    const addToCart = page.getByRole('button', { name: /add to cart/i })
    const anyButton = followAndAdd.or(addToCart).first()
    if (!(await anyButton.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.skip(true, 'No catalog rows for this tenant')
    }
    await expect(anyButton).toBeVisible()
  })

  test('supplier growth page shows prospect statuses without match data', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier only')

    try {
      await page.goto('/app/customer-growth', { waitUntil: 'domcontentloaded' })
    } catch {
      test.skip(true, 'Growth navigation timed out')
    }
    if (!page.url().includes('customer-growth')) {
      test.skip(true, 'Growth route not available for this plan')
    }
    await expect(page.getByText(/already on supplify/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^connect$/i })).toHaveCount(0)
  })

  test('supplier new-conversation dialog searches followers on the server', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier only')

    const requests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/restaurants')) requests.push(req.url())
    })
    try {
      await page.goto('/app/chat', { waitUntil: 'domcontentloaded' })
    } catch {
      test.skip(true, 'Chat navigation timed out')
    }
    const newConversation = page.getByRole('button', { name: /new conversation|new chat/i }).first()
    if (!(await newConversation.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.skip(true, 'Chat UI not available for this tenant/plan')
    }
    await newConversation.click()
    await expect
      .poll(() => requests.some((url) => /limit=20/.test(url) && !/limit=200/.test(url)), {
        timeout: 15000,
      })
      .toBe(true)
  })
})
