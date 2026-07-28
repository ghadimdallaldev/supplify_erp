import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class DealsPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/deals', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('deals-page')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['deals-page'], /deal/i, 'Deals')
  }
}
