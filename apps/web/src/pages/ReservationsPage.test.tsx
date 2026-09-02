import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/utils'
import { ReservationsPage } from './ReservationsPage'

const boardRefetchMock = vi.fn()

vi.mock('../services/reservationsApi', () => ({
  useGetReservationBoardQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: { data: { error: { message: 'Board unavailable' } } },
    refetch: boardRefetchMock,
  }),
  useGetReservationAnalyticsQuery: () => ({
    data: undefined,
    refetch: vi.fn(),
  }),
  useGetGuestIntelligenceQuery: () => ({
    data: { recentGuests: [], repeatGuests: [], vipGuests: [], followUps: [] },
    isLoading: false,
  }),
  useGetReservationWaitlistQuery: () => ({
    data: { waitlist: [] },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useManuallyPromoteWaitlistMutation: () => [vi.fn(), { isLoading: false }],
  useGetPublicBookingSettingsQuery: () => ({ data: undefined }),
  useUpdatePublicBookingSettingsMutation: () => [vi.fn(), { isLoading: false }],
  useSaveReservationTablesMutation: () => [vi.fn(), { isLoading: false }],
  useCreateReservationMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateReservationStatusMutation: () => [vi.fn(), { isLoading: false }],
  useAssignReservationTablesMutation: () => [vi.fn(), { isLoading: false }],
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useGetRestaurantMeQuery: () => ({
      data: { restaurant: { id: 'r1', slug: 'test-bistro' } },
    }),
    useGetEntitlementsQuery: () => ({
      data: { entitlements: { features: { waitlist_auto_promo: true } } },
    }),
    useGetBranchesQuery: () => ({ data: { branches: [] } }),
  }
})

vi.mock('../components/RequirePermission', () => ({
  RequirePermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../components/reservations/ReservationBoard', () => ({
  ReservationBoard: () => <div data-testid="reservation-board" />,
}))

vi.mock('../components/reservations/ReservationTableBuilder', () => ({
  ReservationTableBuilder: () => null,
}))

vi.mock('../components/reservations/ReservationAnalyticsPanel', () => ({
  ReservationAnalyticsPanel: () => null,
}))

vi.mock('../components/reservations/PublicBookingSettingsCard', () => ({
  PublicBookingSettingsCard: () => null,
}))

vi.mock('../components/reservations/ReservationCreateDrawer', () => ({
  ReservationCreateDrawer: () => null,
}))

vi.mock('../components/reservations/ReservationAssignmentsSummary', () => ({
  ReservationAssignmentsSummary: () => null,
}))

describe('ReservationsPage board error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows error card with retry when board query fails', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReservationsPage />)

    expect(screen.getByText(/board unavailable/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(boardRefetchMock).toHaveBeenCalled()
  })
})
