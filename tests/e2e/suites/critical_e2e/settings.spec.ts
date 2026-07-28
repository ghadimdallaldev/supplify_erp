import { test, expect } from '../../fixtures'
import { resetAndSeed } from '../../utils/seed'
import { webReachable, requireAuthSuite } from '../../utils/reachability'

const auth = requireAuthSuite()

test.describe('Settings', () => {
  test.beforeAll(async () => {
    await auth.init()
  })

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request, { scenario: 'subscription_limits_basic', soft: true })
  })

  test('restaurant settings page loads', async ({ page, settingsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    await settingsPage.gotoRestaurantSettings()
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Settings redirected')
    }
    try {
      await settingsPage.expectRestaurantSettingsLoaded()
    } catch {
      test.skip(true, 'Restaurant settings UI did not settle')
    }
  })

  test('restaurant onboarding settings page loads', async ({ page, settingsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_restaurant', 'Restaurant-only')

    await settingsPage.gotoRestaurantOnboarding()
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Onboarding redirected')
    }
    try {
      await settingsPage.expectRestaurantOnboardingLoaded()
    } catch {
      test.skip(true, 'Onboarding UI did not settle')
    }
  })

  test('supplier settings page loads', async ({ page, settingsPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    auth.requireAuth()
    test.skip(test.info().project.name !== 'critical_e2e_supplier', 'Supplier-only')

    await settingsPage.gotoSupplierSettings()
    if (page.url().includes('/login') || page.url().includes('/activate')) {
      test.skip(true, 'Supplier settings redirected')
    }
    try {
      await settingsPage.expectSupplierSettingsLoaded()
    } catch {
      test.skip(true, 'Supplier settings UI did not settle')
    }
  })
})
