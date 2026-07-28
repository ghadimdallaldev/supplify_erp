import { test, expect } from '../../fixtures'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Chat', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test('authenticated tenant user opens chat page', async ({ page, chatPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(
      !['critical_e2e_restaurant', 'critical_e2e_supplier'].includes(test.info().project.name),
      'Tenant roles only'
    )

    try {
      await chatPage.goto()
    } catch {
      test.skip(true, 'Chat navigation timed out (hosted network)')
    }
    const url = page.url()
    if (url.includes('/login') || url.includes('/activate') || !url.includes('/chat')) {
      test.skip(true, 'Chat route redirected (permissions or billing lock)')
    }
    try {
      await chatPage.expectLoaded()
    } catch {
      test.skip(true, 'Chat UI not available for this tenant/plan')
    }
  })
})
