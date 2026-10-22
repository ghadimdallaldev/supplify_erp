import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminFeaturedPlacementsPanel } from './AdminFeaturedPlacementsPanel'

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  query: vi.fn(),
  mutation: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (permission: string) => mocks.permissions.has(permission),
  }),
}))

vi.mock('../../services/api', () => ({
  useGetAdminFeaturedPlacementsQuery: (...args: unknown[]) => mocks.query(...args),
  useApproveFeaturedPlacementMutation: () => [mocks.mutation],
  useRejectFeaturedPlacementMutation: () => [mocks.mutation],
  useRefundFeaturedPlacementMutation: () => [mocks.mutation],
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('AdminFeaturedPlacementsPanel permissions', () => {
  beforeEach(() => {
    mocks.permissions.clear()
    mocks.query.mockReturnValue({
      data: {
        placements: [
          {
            id: 'pending-1',
            supplier_name: 'Pending Supplier',
            status: 'pending',
            payment_status: 'paid',
            pricing_key: 'featured_supplier_week',
          },
          {
            id: 'active-1',
            supplier_name: 'Active Supplier',
            status: 'active',
            payment_status: 'paid',
            pricing_key: 'featured_supplier_week',
            ends_at: '2026-11-01T00:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      refetch: mocks.refetch,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not render or fetch for admins without growth or finance access', () => {
    render(<AdminFeaturedPlacementsPanel />)

    expect(screen.queryByTestId('admin-featured-placements-panel')).not.toBeInTheDocument()
    expect(mocks.query).toHaveBeenCalledWith(undefined, { skip: true })
  })

  it('shows review actions only to growth admins', () => {
    mocks.permissions.add('ADMIN_GROWTH')

    render(<AdminFeaturedPlacementsPanel />)

    expect(screen.getByText('placements.approve')).toBeInTheDocument()
    expect(screen.getByText('placements.reject')).toBeInTheDocument()
    expect(screen.queryByText('placements.refund')).not.toBeInTheDocument()
    expect(mocks.query).toHaveBeenCalledWith(undefined, { skip: false })
  })

  it('shows refund actions only to finance admins', () => {
    mocks.permissions.add('ADMIN_FINANCE')

    render(<AdminFeaturedPlacementsPanel />)

    expect(screen.getByText('placements.refund')).toBeInTheDocument()
    expect(screen.queryByText('placements.approve')).not.toBeInTheDocument()
    expect(screen.queryByText('placements.reject')).not.toBeInTheDocument()
  })
})
