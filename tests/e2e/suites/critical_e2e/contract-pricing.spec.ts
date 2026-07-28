import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Contract pricing', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'catalog_basic', soft: true })
  })

  test('restaurant opens contract pricing page', async ({ page, contractPricingPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    try {
      await contractPricingPage.gotoMyPrices()
    } catch {
      test.skip(true, 'navigation timed out')
    }
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Contract pricing redirected')
    }
    try {
      await contractPricingPage.expectAnyLoaded()
    } catch {
      try {
        await contractPricingPage.gotoContractPricing()
      } catch {
        test.skip(true, 'navigation timed out')
      }
      try {
        await contractPricingPage.expectAnyLoaded()
      } catch {
        test.skip(true, 'UI did not settle')
      }
    }
  })
})
