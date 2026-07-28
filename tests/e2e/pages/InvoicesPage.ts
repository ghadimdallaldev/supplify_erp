import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class InvoicesPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/invoices', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('invoices-page')
  }

  async expectLoaded(): Promise<void> {
    await this.assertNotLoginOrExpired()
    await this.waitForPageReady()
    // Hosted builds may lack invoices-page testid; header title is often a non-heading.
    const loaded = this.page
      .getByTestId('invoices-page')
      .or(this.page.getByRole('heading', { name: /invoice|billing|payments|finance/i }))
      .or(this.page.getByText(/^Invoices$/i))
    await loaded
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {
        throw new Error(`Invoices did not load. URL: ${this.page.url()}`)
      })
  }
}
