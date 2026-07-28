import { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class ChatPage extends BasePage {
  constructor(page: Page, baseURL: string) {
    super(page, baseURL)
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/chat', { waitUntil: 'domcontentloaded' })
  }

  get pageContainer() {
    return this.getByTestId('chat-page')
  }

  async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['chat-page'],
      /chat|messages|conversations|inbox/i,
      'Chat'
    )
  }
}
