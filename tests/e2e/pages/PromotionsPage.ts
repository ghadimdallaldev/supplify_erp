import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class PromotionsPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/promotions', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('promotions-page')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['promotions-page', 'deals-page'],
      /promotion|deal|offer|campaign/i,
      'Promotions'
    )
  }
}
