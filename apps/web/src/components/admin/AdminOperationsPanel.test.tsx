import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminOperationsPanel } from './AdminOperationsPanel'

const defaultSkipQuery = { data: undefined, isLoading: false, refetch: vi.fn() }

vi.mock('../../services/api', () => ({
  useGetAdminOperationalSummaryQuery: vi.fn(),
  useGetAdminEmailDeliveryLogsQuery: vi.fn(() => defaultSkipQuery),
  useGetAdminFulfillmentIssuesQuery: vi.fn(() => defaultSkipQuery),
  useGetAdminActiveDeliveriesQuery: vi.fn(() => defaultSkipQuery),
  useGetAdminSuppliersQuery: vi.fn(),
  useGetAdminRestaurantsQuery: vi.fn(),
  useGetAdminSupportConversationsQuery: vi.fn(() => defaultSkipQuery),
}))

vi.mock('./AdminTenantDiagnosticsDrawer', () => ({
  AdminTenantDiagnosticsDrawer: () => null,
}))

vi.mock('./AdminSupportChatPanel', () => ({
  AdminSupportChatPanel: () => null,
}))

vi.mock('./AdminFeaturedPlacementsPanel', () => ({
  AdminFeaturedPlacementsPanel: () => null,
}))

import {
  useGetAdminOperationalSummaryQuery,
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
} from '../../services/api'

describe('AdminOperationsPanel', () => {
  beforeEach(() => {
    vi.mocked(useGetAdminSuppliersQuery).mockReturnValue({ data: { suppliers: [] } } as never)
    vi.mocked(useGetAdminRestaurantsQuery).mockReturnValue({ data: { restaurants: [] } } as never)
  })

  it('renders warnings from summary', () => {
    vi.mocked(useGetAdminOperationalSummaryQuery).mockReturnValue({
      data: {
        summary: {
          warnings: [
            { id: 'email-provider-missing', severity: 'danger', message: 'Email provider missing' },
          ],
          email: { failed24h: 0 },
          fulfillment: { openIssues: 0 },
          gpsDeliveries: { stale: 0 },
          expiry: { expiredLots: 0 },
        },
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    } as never)

    render(<AdminOperationsPanel />)
    expect(screen.getByText('Email provider missing')).toBeInTheDocument()
  })

  it('shows empty state when no warnings', () => {
    vi.mocked(useGetAdminOperationalSummaryQuery).mockReturnValue({
      data: {
        summary: { warnings: [], email: {}, fulfillment: {}, gpsDeliveries: {}, expiry: {} },
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    } as never)

    render(<AdminOperationsPanel />)
    expect(screen.getByText('No warnings')).toBeInTheDocument()
  })
})
