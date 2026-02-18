import { test, expect } from '../../fixtures'
import { webReachable } from '../../utils/reachability'

test.describe('Smoke', () => {
  test('login page loads and shows sign-in', async ({ page, loginPage }) => {
    test.skip(!webReachable(), 'Web app not running')
    await loginPage.goToLogin()
    await loginPage.expectOnLoginPage()
    await expect(loginPage.loginButton).toBeVisible()
  })

  test('unauthenticated redirect to login when opening app', async ({ page }) => {
    test.skip(!webReachable(), 'Web app not running')
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {})
    const url = page.url()
    expect(url).toMatch(/\/login/)
  })
})
