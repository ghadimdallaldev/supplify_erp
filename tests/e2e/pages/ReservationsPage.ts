import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class ReservationsPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/reservations', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('reservations-page')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['reservations-page'], /reservation/i, 'Reservations')
  }
}
