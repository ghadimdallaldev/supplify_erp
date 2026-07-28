import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class DriverDeliveriesPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/driver-deliveries', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('driver-deliveries-page')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['driver-deliveries-page'],
      /deliver/i,
      'Driver deliveries'
    )
  }
}
