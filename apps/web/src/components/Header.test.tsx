import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Header } from './Header'
import { renderWithProviders } from '../test/utils'

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useLogoutMutation: () => [vi.fn()],
    useGetNotificationsQuery: () => ({ data: { notifications: [] } }),
    useMarkAllNotificationsReadMutation: () => [vi.fn()],
  }
})

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render header with content', () => {
    renderWithProviders(<Header />)
    expect(screen.getByText(/Logout/i)).toBeInTheDocument()
  })
})
