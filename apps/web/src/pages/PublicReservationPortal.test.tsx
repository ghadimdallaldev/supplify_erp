import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/utils'
import { PublicReservationPortal } from './PublicReservationPortal'
import { localDateKey } from '../lib/invoiceBalance'
import type { PublicAvailabilityResponse } from '../types'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const fetchAvailability = vi.fn(),
  createReservation = vi.fn(),
  joinWaitlist = vi.fn(),
  navigate = vi.fn()
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useParams: () => ({ restaurantIdOrSlug: 'qa-bistro' }),
  useNavigate: () => navigate,
}))
vi.mock('../services/api', async (original) => ({
  ...(await original<typeof import('../services/api')>()),
  useGetPublicRestaurantQuery: () => ({
    data: { id: 'restaurant-1', name: 'QA Bistro', phone: '+96170000000' },
    isLoading: false,
    isError: false,
  }),
  useLazyGetPublicReservationAvailabilityQuery: () => [fetchAvailability, { isFetching: false }],
  useCreatePublicReservationMutation: () => [createReservation, { isLoading: false }],
  useJoinPublicWaitlistMutation: () => [joinWaitlist, { isLoading: false }],
}))
function availability(date = localDateKey()): PublicAvailabilityResponse {
  return {
    totalCapacity: 20,
    slots: [
      {
        startTime: `${date}T18:00:00Z`,
        endTime: `${date}T19:30:00Z`,
        capacityAvailable: 10,
        isAvailable: true,
      },
    ],
  }
}
async function enterContact() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'QA Guest' } })
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'qa@example.test' } })
  fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '+96170000000' } })
}
beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  fetchAvailability.mockImplementation(({ date }) => ({
    unwrap: () => Promise.resolve(availability(date)),
  }))
  createReservation.mockReturnValue({
    unwrap: () => Promise.resolve({ reservation: { manageToken: 'qa-token' } }),
  })
})
describe('public booking availability', () => {
  it('shows contact guidance when no tables are configured, without a zero-capacity error or booking action', async () => {
    fetchAvailability.mockReturnValue({
      unwrap: () => Promise.resolve({ slots: [], totalCapacity: 0, tableCount: 0 }),
    })
    renderWithProviders(<PublicReservationPortal />)
    await userEvent.click(screen.getByRole('button', { name: /check availability/i }))
    expect(await screen.findByText(/Online booking is currently unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact the restaurant/i })).toHaveAttribute(
      'href',
      'tel:+96170000000'
    )
    expect(screen.getByRole('button', { name: /confirm reservation/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /join waitlist/i })).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
    expect(createReservation).not.toHaveBeenCalled()
  })
  it('invalidates time selection when party size changes and ignores late availability for an old date', async () => {
    renderWithProviders(<PublicReservationPortal />)
    await userEvent.click(screen.getByRole('button', { name: /check availability/i }))
    const group = await screen.findByRole('group', { name: 'Available reservation times' })
    await userEvent.click(within(group).getByRole('button'))
    await enterContact()
    expect(screen.getByRole('button', { name: /confirm reservation/i })).toBeEnabled()
    fireEvent.change(screen.getByLabelText(/party size/i), { target: { value: '4' } })
    expect(screen.getByRole('button', { name: /confirm reservation/i })).toBeDisabled()
    expect(
      screen.queryByRole('group', { name: 'Available reservation times' })
    ).not.toBeInTheDocument()
    let resolve!: (value: PublicAvailabilityResponse) => void
    fetchAvailability.mockReturnValueOnce({
      unwrap: () =>
        new Promise<PublicAvailabilityResponse>((r) => {
          resolve = r
        }),
    })
    await userEvent.click(screen.getByRole('button', { name: /check availability/i }))
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2099-01-01' } })
    resolve(availability())
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Available reservation times' })
      ).not.toBeInTheDocument()
    )
    expect(createReservation).not.toHaveBeenCalled()
  })
  it('requires deposit acknowledgment and submits a double tap only once', async () => {
    fetchAvailability.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          ...availability(),
          depositRequired: true,
          depositMode: 'fixed',
          depositAmount: 20,
        }),
    })
    createReservation.mockReturnValue({ unwrap: () => new Promise(() => {}) })
    renderWithProviders(<PublicReservationPortal />)
    await userEvent.click(screen.getByRole('button', { name: /check availability/i }))
    await userEvent.click(
      within(await screen.findByRole('group', { name: 'Available reservation times' })).getByRole(
        'button'
      )
    )
    await enterContact()
    const confirm = screen.getByRole('button', { name: /confirm reservation/i })
    expect(confirm).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    expect(confirm).toBeEnabled()
    await userEvent.dblClick(confirm)
    expect(createReservation).toHaveBeenCalledTimes(1)
    expect(createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ partySize: 2, customerName: 'QA Guest', depositAcknowledged: true })
    )
  })
})
