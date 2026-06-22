import '@testing-library/jest-dom/vitest'
import { ensureTestI18n, resetTestI18n } from './i18n'

await ensureTestI18n()
await resetTestI18n()
