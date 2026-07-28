import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class QuotesPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/quote-requests', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('quote-requests-page')
  }

  async expectLoaded(): Promise<void> {
    await this.assertNotLoginOrExpired()
    await this.waitForPageReady()
    const loaded = this.page
      .getByTestId('quote-requests-page')
      .or(this.page.getByRole('heading', { name: /quote/i }))
      .or(this.page.getByText(/quote request/i))
    await loaded
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {
        throw new Error(`Quotes did not load. URL: ${this.page.url()}`)
      })
  }
}
