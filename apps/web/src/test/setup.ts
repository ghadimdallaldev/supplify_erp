import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { ensureTestI18n, resetTestI18n } from './i18n'

await ensureTestI18n()
await resetTestI18n()

afterEach(() => {
  cleanup()
})
