import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class AdminDashboardPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/admin', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('admin-dashboard-page')
  }

  async expectAdminDashboardLoaded(): Promise<void> {
    await this.pageContainer.waitFor({ state: 'visible', timeout: 15000 })
  }
}
