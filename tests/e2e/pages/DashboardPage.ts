import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class AppDashboardPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' })
    // Role home may redirect (admin → /app/admin, supplier → command-center)
    await this.page
      .waitForURL(/\/app\/(dashboard|admin|command-center)/, { timeout: 15000 })
      .catch(() => {})
  }

  get pageContainer() {
    return this.getByTestId('dashboard-page')
  }

  get sidebar() {
    return this.getByTestId('sidebar').or(this.getByTestId('admin-sidebar'))
  }

  navLink(name: string) {
    const testId = `nav-${name.toLowerCase().replace(/\s+/g, '-')}`
    return this.getByTestId(testId)
  }

  async expectDashboardLoaded(): Promise<void> {
    await this.assertNotLoginOrExpired()
    const url = this.page.url()
    // eslint-disable-next-line no-console
    console.log('[DashboardPage] expectDashboardLoaded URL:', url)
    // Admin → /app/admin; supplier often → /app/command-center; restaurant → /app/dashboard
    const combined = this.getByTestId('dashboard-page')
      .or(this.getByTestId('admin-dashboard-page'))
      .or(this.getByTestId('admin-shell'))
      .or(this.getByTestId('command-center-page'))
      .or(this.getByTestId('sidebar'))
      .or(this.page.getByRole('heading', { name: /dashboard|welcome|overview|command center/i }))
    await combined
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.log('[DashboardPage] expectDashboardLoaded failed; URL:', url)
        throw new Error(`Dashboard page did not load. URL: ${url}`)
      })
  }
}
