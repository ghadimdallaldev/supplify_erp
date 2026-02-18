import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class OrdersPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/orders', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('orders-page')
  }

  orderRow(orderId: string) {
    return this.getByTestId(`order-row-${orderId}`)
  }

  orderActionAcknowledge(orderId: string) {
    return this.getByTestId(`order-${orderId}-acknowledge`)
  }

  orderActionShip(orderId: string) {
    return this.getByTestId(`order-${orderId}-ship`)
  }

  orderActionDeliver(orderId: string) {
    return this.getByTestId(`order-${orderId}-deliver`)
  }

  async expectOrdersPageLoaded(): Promise<void> {
    await this.pageContainer.waitFor({ state: 'visible', timeout: 15000 })
  }
}
