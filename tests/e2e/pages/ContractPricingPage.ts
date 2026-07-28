import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class ContractPricingPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async gotoMyPrices(): Promise<void> {
    await this.page.goto('/app/my-prices', { waitUntil: 'domcontentloaded' })
  }

  async gotoContractPricing(): Promise<void> {
    await this.page.goto('/app/contract-pricing', { waitUntil: 'domcontentloaded' })
  }

  get myPricesPage() {
    return this.getByTestId('my-contract-prices-page')
  }

  get contractPricingPage() {
    return this.getByTestId('contract-pricing-page')
  }

  async expectMyPricesLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['my-contract-prices-page', 'contract-pricing-page'],
      /price|contract/i,
      'My prices'
    )
  }

  async expectContractPricingLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['contract-pricing-page', 'my-contract-prices-page'],
      /price|contract/i,
      'Contract pricing'
    )
  }

  async expectAnyLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['my-contract-prices-page', 'contract-pricing-page'],
      /price|contract/i,
      'Contract pricing'
    )
  }
}
