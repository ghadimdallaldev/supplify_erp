import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class OrdersPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/orders', { waitUntil: 'domcontentloaded' })
  }

  /**
   * Navigate to orders and assert /api/orders returns 200. Throws with body dump if not 200.
   * Use this to fail fast instead of UI timeouts when API returns 403 etc.
   */
  async gotoAndExpectOrdersApiOk(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (r) => {
        const u = r.url()
        return (
          (u.includes('/api/orders') || u.endsWith('/api/orders')) && r.request().method() === 'GET'
        )
      },
      { timeout: 15000 }
    )
    await this.goto()
    const response = await responsePromise
    if (response.status() !== 200) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Orders API returned ${response.status()}. Body: ${body.slice(0, 500)}${body.length > 500 ? '...' : ''}`
      )
    }
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
    await this.assertNotLoginOrExpired()
    const url = this.page.url()
    // eslint-disable-next-line no-console
    console.log('[OrdersPage] expectOrdersPageLoaded URL:', url)
    const combined = this.getByTestId('orders-page').or(
      this.page.getByRole('heading', { name: /orders/i })
    )
    await combined
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.log('[OrdersPage] expectOrdersPageLoaded failed; URL:', url)
        throw new Error(`Orders page did not load. URL: ${url}`)
      })
  }
}
