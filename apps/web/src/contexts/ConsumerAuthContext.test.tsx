import { beforeEach, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/utils'
import { ConsumerAuthProvider, useConsumerAuth } from './ConsumerAuthContext'
const logoutMutation = vi.fn(),
  refetch = vi.fn()
vi.mock('../services/consumerApi', async (original) => ({
  ...(await original<typeof import('../services/consumerApi')>()),
  useGetConsumerMeQuery: () => ({
    currentData: {
      member: { id: 'm1', displayName: 'QA Guest', loyaltyPoints: 250 },
      recentLedger: [{ id: 'l1' }],
      recentOrders: [{ id: 'o1' }],
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch,
  }),
  useConsumerLoginMutation: () => [vi.fn()],
  useConsumerSignupMutation: () => [vi.fn()],
  useConsumerLogoutMutation: () => [logoutMutation],
}))
function Account() {
  const account = useConsumerAuth()
  return (
    <>
      <p>{account.member?.displayName ?? 'Signed out'}</p>
      <p>Points: {account.loyaltyPoints}</p>
      <p>History: {account.recentLedger.length + account.recentOrders.length}</p>
      <button
        onClick={() => {
          void account.logout()
        }}
      >
        Sign out
      </button>
    </>
  )
}
beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  logoutMutation.mockReturnValue({ unwrap: () => Promise.resolve({ loggedOut: true }) })
})
it('clears the previous guest identity, points, and histories immediately after logout even while cached data remains', async () => {
  renderWithProviders(
    <ConsumerAuthProvider restaurantSlug="qa">
      <Account />
    </ConsumerAuthProvider>
  )
  expect(screen.getByText('QA Guest')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(screen.getByText('Signed out')).toBeInTheDocument())
  expect(screen.getByText('Points: 0')).toBeInTheDocument()
  expect(screen.getByText('History: 0')).toBeInTheDocument()
})
