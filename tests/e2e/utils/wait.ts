import { Page } from '@playwright/test'

/**
 * Wait for network to be idle (no requests for 500ms). Prefer over fixed sleeps.
 */
export async function waitForNetworkIdle(page: Page, timeoutMs = 500): Promise<void> {
  await page.waitForLoadState('networkidle')
}

/**
 * Wait for a response matching a URL pattern, then return the response.
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  timeoutMs = 15000
): Promise<void> {
  await page.waitForResponse(
    (res) => {
      const u = res.url()
      if (typeof urlPattern === 'string') return u.includes(urlPattern)
      return urlPattern.test(u)
    },
    { timeout: timeoutMs }
  )
}
