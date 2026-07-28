import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class AdminDashboardPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/admin', { waitUntil: 'domcontentloaded' })
  }

  async gotoTenants(): Promise<void> {
    await this.page.goto('/app/admin/tenants', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('admin-dashboard-page')
  }

  get sidebar() {
    return this.getByTestId('admin-sidebar')
  }

  navTab(tab: string) {
    return this.getByTestId(`admin-nav-${tab}`)
  }

  get tenantsTab() {
    return this.getByTestId('admin-tenants-tab')
  }

  async expectAdminDashboardLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['admin-dashboard-page', 'admin-shell'],
      /overview|admin|platform/i,
      'Admin dashboard'
    )
  }

  async expectSidebarVisible(): Promise<void> {
    await this.sidebar.waitFor({ state: 'visible', timeout: 15000 })
  }
}
