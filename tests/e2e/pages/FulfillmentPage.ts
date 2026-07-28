import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class FulfillmentPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/fulfillment', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('fulfillment-page')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['fulfillment-page'], /fulfillment/i, 'Fulfillment')
  }
}
