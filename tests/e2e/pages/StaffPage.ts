import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class StaffPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/staff', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('staff-page')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['staff-page'], /staff/i, 'Staff')
  }
}
