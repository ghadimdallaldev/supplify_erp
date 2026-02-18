import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class ProductsPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/products', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('products-page')
  }

  productRow(productId: string) {
    return this.getByTestId(`product-row-${productId}`)
  }

  productAddToCart(productId: string) {
    return this.getByTestId(`product-add-to-cart-${productId}`)
  }

  async expectProductsPageLoaded(): Promise<void> {
    await this.pageContainer.waitFor({ state: 'visible', timeout: 15000 })
  }
}
