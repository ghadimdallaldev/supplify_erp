import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class LoginPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goToLogin(): Promise<void> {
    await this.page.goto('/login', { waitUntil: 'domcontentloaded' })
  }

  get loginButton() {
    return this.getByTestId('login-button')
  }

  get pageContainer() {
    return this.getByTestId('login-page')
  }

  async expectOnLoginPage(): Promise<void> {
    await this.pageContainer.waitFor({ state: 'visible', timeout: 10000 })
  }

  async clickSignInWithKeycloak(): Promise<void> {
    await this.loginButton.click()
    // Redirects to Keycloak; caller should wait for next state
  }
}
