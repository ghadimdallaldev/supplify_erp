import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { DisputesPage } from './DisputesPage'
import { renderWithProviders } from '../../test/utils'
import { expectLgCardTableSplit } from '../../test/viewports'

const mockDisputes = vi.fn()

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
  }),
}))

vi.mock('../../hooks/useImpersonation', () => ({
  useImpersonation: () => ({
    isEffectiveSupplier: false,
    isEffectiveRestaurant: true,
    isImpersonating: false,
    isPlatformAdmin: false,
  }),
}))

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetDisputesQuery: (...args: unknown[]) => mockDisputes(...args),
    useGetIncomingDisputesQuery: () => ({ data: { disputes: [] }, isLoading: false }),
    useGetEntitlementsQuery: () => ({
      data: { entitlements: { features: { disputes_returns: true } } },
    }),
    useGetOrdersQuery: () => ({ data: { orders: [] } }),
    useGetOrderQuery: () => ({ data: undefined }),
    useGetSuppliersQuery: () => ({ data: { suppliers: [] } }),
    useReviewDisputeMutation: () => [vi.fn(), { isLoading: false }],
    useResolveDisputeMutation: () => [vi.fn(), { isLoading: false }],
    useRejectDisputeMutation: () => [vi.fn(), { isLoading: false }],
  }
})

describe('DisputesPage responsive layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDisputes.mockReturnValue({
      data: {
        disputes: [
          {
            id: 'disp-1',
            order_id: 'ord-12345678',
            type: 'short_delivery',
            status: 'open',
            disputed_amount: 25,
          },
        ],
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
  })

  it('uses lg card/table split for dispute lists', () => {
    renderWithProviders(<DisputesPage />)

    const cards = screen.getByTestId('disputes-card-list')
    const table = screen.getByTestId('disputes-table-view')
    expectLgCardTableSplit(cards, table)
  })
})
