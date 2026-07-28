import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class SettingsPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async gotoRestaurantSettings(): Promise<void> {
    await this.page.goto('/app/settings', { waitUntil: 'domcontentloaded' })
  }

  async gotoRestaurantOnboarding(): Promise<void> {
    await this.page.goto('/app/onboarding', { waitUntil: 'domcontentloaded' })
  }

  async gotoSupplierSettings(): Promise<void> {
    await this.page.goto('/app/supplier-settings', { waitUntil: 'domcontentloaded' })
  }

  get restaurantSettingsPage() {
    return this.getByTestId('settings-page')
  }

  get restaurantOnboardingPage() {
    return this.getByTestId('restaurant-settings-page')
  }

  get supplierSettingsPage() {
    return this.getByTestId('supplier-settings-page')
  }

  async expectRestaurantSettingsLoaded(): Promise<void> {
    await this.assertNotLoginOrExpired()
    await this.waitForPageReady()
    const loaded = this.page
      .getByTestId('settings-page')
      .or(this.getByTestId('restaurant-settings-page'))
      .or(this.page.getByRole('heading', { name: /settings|profile|account/i }))
      .or(this.page.getByText(/^Settings$/i))
    await loaded
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {
        throw new Error(`Restaurant settings did not load. URL: ${this.page.url()}`)
      })
  }

  async expectRestaurantOnboardingLoaded(): Promise<void> {
    await this.assertNotLoginOrExpired()
    await this.waitForPageReady()
    const loaded = this.page
      .getByTestId('restaurant-settings-page')
      .or(this.getByTestId('settings-page'))
      .or(this.page.getByRole('heading', { name: /onboarding|settings|profile/i }))
      .or(this.page.getByText(/onboarding|get started|complete your/i))
    await loaded
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {
        throw new Error(`Onboarding did not load. URL: ${this.page.url()}`)
      })
  }

  async expectSupplierSettingsLoaded(): Promise<void> {
    await this.assertNotLoginOrExpired()
    await this.waitForPageReady()
    const loaded = this.page
      .getByTestId('supplier-settings-page')
      .or(this.getByTestId('settings-page'))
      .or(this.page.getByRole('heading', { name: /settings|profile|business/i }))
      .or(this.page.getByText(/^Settings$/i))
    await loaded
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {
        throw new Error(`Supplier settings did not load. URL: ${this.page.url()}`)
      })
  }
}
