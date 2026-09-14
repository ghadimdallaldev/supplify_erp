import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    bannerVisible: true,
    subscribed: false,
    enabling: false,
    enable: vi.fn(),
  }),
}))

vi.mock('../../i18n', () => ({
  ensureNamespace: vi.fn(),
}))

describe('PushEnableBanner', () => {
  it('resolves ui/button and renders enable control when allowed', async () => {
    const { PushEnableBanner } = await import('./PushEnableBanner')
    const { container } = render(<PushEnableBanner allowed />)
    expect(container.querySelector('button')).toBeTruthy()
  })
})
