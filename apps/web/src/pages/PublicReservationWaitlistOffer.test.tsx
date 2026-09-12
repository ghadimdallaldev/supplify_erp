import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/utils'
import { PublicReservationWaitlistOffer } from './PublicReservationWaitlistOffer'

const acceptMock = vi.fn()
const declineMock = vi.fn()
const navigateMock = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => ({ token: 'offer-token-1' }),
    useNavigate: () => navigateMock,
  }
})

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useAcceptWaitlistOfferMutation: () => [acceptMock, { isLoading: false }],
    useDeclineWaitlistOfferMutation: () => [declineMock, { isLoading: false }],
  }
})

describe('PublicReservationWaitlistOffer', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    acceptMock.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          manageToken: 'reservation-public-token',
          reservation: {},
          waitlist: {},
        }),
    })
    declineMock.mockReturnValue({
      unwrap: () => Promise.resolve({ message: 'Declined', waitlist: {} }),
    })
  })

  it('accepts offer and navigates to manage page', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PublicReservationWaitlistOffer action="accept" />)

    await user.click(screen.getByRole('button', { name: /accept table/i }))

    await waitFor(() => {
      expect(acceptMock).toHaveBeenCalledWith('offer-token-1')
      expect(navigateMock).toHaveBeenCalledWith('/reserve/manage/reservation-public-token', {
        replace: true,
      })
    })
  })

  it('shows expired state when accept returns 410', async () => {
    acceptMock.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 410,
          data: { error: { message: 'This waitlist offer has expired' } },
        }),
    })

    const user = userEvent.setup()
    renderWithProviders(<PublicReservationWaitlistOffer action="accept" />)
    await user.click(screen.getByRole('button', { name: /accept table/i }))

    expect(await screen.findByText(/offer expired/i)).toBeInTheDocument()
  })

  it('declines offer and shows confirmation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PublicReservationWaitlistOffer action="decline" />)

    await user.click(screen.getByRole('button', { name: /decline offer/i }))

    expect(await screen.findByText(/offer declined/i)).toBeInTheDocument()
    expect(declineMock).toHaveBeenCalledWith('offer-token-1')
  })
})
