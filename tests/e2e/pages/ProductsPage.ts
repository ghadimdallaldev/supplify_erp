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
    await this.assertNotLoginOrExpired()
    const url = this.page.url()
    // eslint-disable-next-line no-console
    console.log('[ProductsPage] expectProductsPageLoaded URL:', url)
    const combined = this.getByTestId('products-page')
      .or(this.getByTestId('catalog-page'))
      .or(this.page.getByRole('heading', { name: /products|catalog/i }))
    await combined
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.log('[ProductsPage] expectProductsPageLoaded failed; URL:', url)
        throw new Error(`Products/catalog page did not load. URL: ${url}`)
      })
  }
}
