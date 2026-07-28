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
    await this.assertNotLoginOrExpired()
    const url = this.page.url()
    // eslint-disable-next-line no-console
    console.log('[CartPage] expectCartPageLoaded URL:', url)
    const combined = this.getByTestId('cart-page').or(
      this.page.getByRole('heading', { name: /cart/i })
    )
    await combined
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.log('[CartPage] expectCartPageLoaded failed; URL:', url)
        throw new Error(`Cart page did not load. URL: ${url}`)
      })
  }

  async clickPlaceOrder(): Promise<void> {
    const desktop = this.placeOrderButton
    const mobile = this.getByTestId('cart-mobile-place-order')
    if (await desktop.isVisible().catch(() => false)) {
      await desktop.click()
      return
    }
    await mobile.click()
  }
}
