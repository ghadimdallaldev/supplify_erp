import { Page } from '@playwright/test'

export class BasePage {
  constructor(
    protected page: Page,
    protected baseURL: string
  ) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' })
  }

  getByTestId(testId: string) {
    return this.page.getByTestId(testId)
  }

  async waitForPageReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded')
    await this.page.waitForLoadState('networkidle').catch(() => {})
  }

  /**
   * Call at start of expect*PageLoaded: fail immediately if session expired or redirected to login,
   * instead of waiting full timeout for a missing test ID. Improves failure visibility.
   */
  async assertNotLoginOrExpired(): Promise<void> {
    const url = this.page.url()
    if (url.includes('/login') || url.includes('expired=true')) {
      throw new Error(
        `Page load check failed: session expired or redirected to login. Current URL: ${url}. Re-run auth setup or use valid storageState.`
      )
    }
  }

  /** Wait for any of the given testids, optionally falling back to a heading (for undeployed testids). */
  async expectVisibleByTestIdOrHeading(
    testIds: string | string[],
    heading?: RegExp,
    label = 'Page'
  ): Promise<void> {
    await this.assertNotLoginOrExpired()
    const ids = Array.isArray(testIds) ? testIds : [testIds]
    let locator = this.getByTestId(ids[0])
    for (const id of ids.slice(1)) {
      locator = locator.or(this.getByTestId(id))
    }
    if (heading) {
      locator = locator.or(this.page.getByRole('heading', { name: heading }))
    }
    const url = this.page.url()
    await locator
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        throw new Error(`${label} did not load. URL: ${url}`)
      })
  }
}
