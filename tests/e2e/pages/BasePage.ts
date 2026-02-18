import { Page } from '@playwright/test'

export class BasePage {
  constructor(
    protected page: Page,
    protected baseURL: string
  ) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' })
  }

  getByTestId(testId: string) {
    return this.page.getByTestId(testId)
  }

  async waitForPageReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded')
    await this.page.waitForLoadState('networkidle').catch(() => {})
  }
}
