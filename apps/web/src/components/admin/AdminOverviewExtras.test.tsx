import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminOverviewExtras } from './AdminOverviewExtras'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetAdminDealInsightsQuery: vi.fn(),
    useGetAdminPendingDealsQuery: vi.fn(),
    useGetAdminHealthQuery: vi.fn(),
    useGetAdminActivityQuery: vi.fn(),
  }
})

import {
  useGetAdminDealInsightsQuery,
  useGetAdminPendingDealsQuery,
  useGetAdminHealthQuery,
  useGetAdminActivityQuery,
} from '../../services/api'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.mocked(useGetAdminDealInsightsQuery).mockReturnValue({
    data: { insights: {} },
    isLoading: false,
  } as ReturnType<typeof useGetAdminDealInsightsQuery>)

  vi.mocked(useGetAdminPendingDealsQuery).mockReturnValue({
    data: { deals: [] },
    isLoading: false,
  } as ReturnType<typeof useGetAdminPendingDealsQuery>)

  vi.mocked(useGetAdminHealthQuery).mockReturnValue({
    data: { recentApiErrors: [] },
    isLoading: false,
  } as ReturnType<typeof useGetAdminHealthQuery>)

  vi.mocked(useGetAdminActivityQuery).mockReturnValue({
    data: { events: [], total: 0, limit: 8, offset: 0 },
    isLoading: false,
  } as ReturnType<typeof useGetAdminActivityQuery>)
})

describe('AdminOverviewExtras', () => {
  it('renders overview panels and quick actions', () => {
    render(
      <AdminOverviewExtras
        overview={{ alerts: {} }}
        onNavigateTab={vi.fn()}
        onRefresh={vi.fn()}
        lastUpdated={new Date('2026-05-29T15:42:00')}
      />
    )

    expect(screen.getByTestId('admin-overview-panels')).toBeInTheDocument()
    expect(screen.getByText('Needs your attention')).toBeInTheDocument()
    expect(screen.getByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText('Quick actions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Subscriptions/i })).toBeInTheDocument()
    expect(screen.getByText(/Updated 03:42 PM/i)).toBeInTheDocument()
  })

  it('shows operational email failure attention item', () => {
    render(
      <AdminOverviewExtras
        overview={{
          alerts: {},
          operational: { emailFailed24h: 6, openFulfillmentIssues: 0 },
        }}
        onNavigateTab={vi.fn()}
      />
    )
    expect(screen.getByText(/6 failed emails in 24h/i)).toBeInTheDocument()
  })

  it('tolerates non-array pending deals payload', () => {
    vi.mocked(useGetAdminPendingDealsQuery).mockReturnValue({
      data: { deals: { id: 'bad-shape' } as unknown as [] },
      isLoading: false,
    } as ReturnType<typeof useGetAdminPendingDealsQuery>)

    render(<AdminOverviewExtras overview={{ alerts: {} }} onNavigateTab={vi.fn()} />)

    expect(screen.getByTestId('admin-overview-panels')).toBeInTheDocument()
  })
})
