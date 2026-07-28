import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class ReceivingPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/receiving', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('receiving-page')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['receiving-page'], /receiving/i, 'Receiving')
  }
}
