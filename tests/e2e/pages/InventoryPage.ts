import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class InventoryPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async gotoRestaurantInventory(): Promise<void> {
    await this.page.goto('/app/restaurant-inventory', { waitUntil: 'domcontentloaded' })
  }

  async gotoSupplierInventory(): Promise<void> {
    await this.page.goto('/app/inventory', { waitUntil: 'domcontentloaded' })
  }

  get restaurantInventoryPage() {
    return this.getByTestId('restaurant-inventory-page')
  }

  get supplierInventoryPage() {
    return this.getByTestId('inventory-page')
  }

  async expectRestaurantInventoryLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['restaurant-inventory-page'],
      /inventory/i,
      'Restaurant inventory'
    )
  }

  async expectSupplierInventoryLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['inventory-page', 'inventory-table-shell'],
      /inventory/i,
      'Supplier inventory'
    )
  }
}
