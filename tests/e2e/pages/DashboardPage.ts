import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class AppDashboardPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('dashboard-page')
  }

  get sidebar() {
    return this.getByTestId('sidebar')
  }

  navLink(name: string) {
    const testId = `nav-${name.toLowerCase().replace(/\s+/g, '-')}`
    return this.getByTestId(testId)
  }

  async expectDashboardLoaded(): Promise<void> {
    await this.pageContainer.waitFor({ state: 'visible', timeout: 15000 })
  }
}
