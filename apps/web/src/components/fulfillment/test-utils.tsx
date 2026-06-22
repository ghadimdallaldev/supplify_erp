import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ensureTestI18n, testI18n } from '../../test/i18n'

export async function ensureFulfillmentTestI18n() {
  await ensureTestI18n()
}

export function renderWithFulfillmentI18n(ui: ReactElement) {
  void ensureTestI18n()
  return render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)
}
