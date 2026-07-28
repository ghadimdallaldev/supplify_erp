import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class OrderDetailPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(orderId: string): Promise<void> {
    await this.page.goto(`/app/orders/${orderId}`, { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('order-detail-page')
  }

  get timeline() {
    return this.getByTestId('order-timeline')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['order-detail-page'], /order/i, 'Order detail')
  }
}
