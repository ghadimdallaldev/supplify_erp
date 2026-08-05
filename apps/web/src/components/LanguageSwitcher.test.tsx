import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageSwitcher } from './LanguageSwitcher'
import { renderWithProviders } from '../test/utils'
import { changeTestLanguage, resetTestI18n } from '../test/i18n'

vi.mock('../i18n', async (importOriginal) => {
  const original = await importOriginal<typeof import('../i18n')>()
  const { changeTestLanguage, testI18n } = await import('../test/i18n')
  return {
    ...original,
    i18n: testI18n,
    changeAppLanguage: changeTestLanguage,
  }
})

describe('LanguageSwitcher', () => {
  beforeEach(async () => {
    await resetTestI18n()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders language options with English active by default', () => {
    renderWithProviders(<LanguageSwitcher />)

    expect(screen.getByTestId('language-switcher')).toBeInTheDocument()
    expect(screen.getByTestId('language-option-en')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('language-option-ar')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('group', { name: 'Change language' })).toBeInTheDocument()
  })

  it('switches language when Arabic is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LanguageSwitcher />)

    await user.click(screen.getByTestId('language-option-ar'))

    await waitFor(() => {
      expect(screen.getByTestId('language-option-ar')).toHaveAttribute('aria-pressed', 'true')
    })
    expect(screen.getByTestId('language-option-en')).toHaveAttribute('aria-pressed', 'false')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
  })
})
