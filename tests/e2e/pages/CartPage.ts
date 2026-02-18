import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class CartPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/cart', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('cart-page')
  }

  get placeOrderButton() {
    return this.getByTestId('cart-place-order')
  }

  cartItemRow(productId: string) {
    return this.getByTestId(`cart-item-row-${productId}`)
  }

  async expectCartPageLoaded(): Promise<void> {
    await this.pageContainer.waitFor({ state: 'visible', timeout: 15000 })
  }
}
