import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { ConsumerRewardsPage } from './ConsumerRewardsPage'
const refreshMe = vi.fn()
let failed = false
vi.mock('../../contexts/ConsumerAuthContext', () => ({
  useConsumerAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    isError: failed,
    member: { displayName: 'QA Guest' },
    loyaltyPoints: 20,
    loyaltyProgram: { enabled: true, min_redeem_points: 100, max_redeem_percent: 50 },
    recentLedger: [],
    recentOrders: [],
    logout: vi.fn(),
    refreshMe,
  }),
}))
beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  failed = false
})
describe('guest rewards guidance', () => {
  it('shows progress to redemption and the actual food discount cap', () => {
    renderWithProviders(<ConsumerRewardsPage />)
    expect(screen.getByText('80 more points to use rewards')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20')
    expect(screen.getByText(/up to 50% of the food subtotal/)).toBeInTheDocument()
  })
  it('offers a retry when rewards cannot load', async () => {
    failed = true
    renderWithProviders(<ConsumerRewardsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load your rewards')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refreshMe).toHaveBeenCalledOnce()
  })
})
