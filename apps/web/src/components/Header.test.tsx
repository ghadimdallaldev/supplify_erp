import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Header } from './Header'
import { renderWithProviders } from '../test/utils'

vi.mock('./BranchSwitcher', () => ({
  BranchSwitcher: () => null,
}))

vi.mock('../hooks/useImpersonation', () => ({
  useImpersonation: () => ({
    isImpersonating: false,
    impersonationTarget: null,
    stopImpersonation: vi.fn(),
  }),
}))

vi.mock('../hooks/useNotificationBadge', () => ({
  useNotificationBadge: () => ({ notifications: [], unreadCount: 0 }),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useLogoutMutation: () => [vi.fn()],
    useGetNotificationsQuery: () => ({ data: { notifications: [] } }),
    useMarkAllNotificationsReadMutation: () => [vi.fn()],
    useGetEntitlementsQuery: () => ({
      data: {
        entitlements: {
          plan: { code: 'gold', name: 'Gold' },
          limits: {},
          usage: {},
        },
      },
    }),
    useRecordConversionEventMutation: () => [vi.fn().mockResolvedValue(undefined)],
  }
})

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render header with content', () => {
    renderWithProviders(<Header />)
    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.getByTestId('logout-button')).toBeInTheDocument()
  })
})
