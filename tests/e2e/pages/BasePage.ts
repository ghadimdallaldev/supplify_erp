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
}
