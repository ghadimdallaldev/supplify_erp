import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { OrdersPage } from './OrdersPage'
import { renderWithProviders } from '../test/utils'
import { expectLgCardTableSplit } from '../test/viewports'

const mockOrders = vi.fn()

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
    isViewOnly: () => false,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('../hooks/useImpersonation', () => ({
  useImpersonation: () => ({
    isEffectiveSupplier: true,
    isEffectiveRestaurant: false,
    isImpersonating: false,
    isPlatformAdmin: false,
    shouldLoadTenantEntitlements: false,
  }),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useGetOrdersQuery: (...args: unknown[]) => mockOrders(...args),
    useGetEntitlementsQuery: () => ({ data: undefined }),
    useAcknowledgeOrderMutation: () => [vi.fn(), { isLoading: false }],
    useDeclineOrderMutation: () => [vi.fn(), { isLoading: false }],
    useUpdateOrderStatusMutation: () => [vi.fn(), { isLoading: false }],
    useCreateManualOrderMutation: () => [vi.fn(), { isLoading: false }],
  }
})

describe('OrdersPage responsive layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrders.mockReturnValue({
      data: {
        orders: [
          {
            id: 'order-abc12345',
            status: 'pending',
            total_amount: 120,
            created_at: '2026-01-01T00:00:00Z',
            restaurant_name: 'Test Restaurant',
          },
        ],
        pagination: { total: 1, limit: 20 },
      },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    })
  })

  it('uses lg card/table split for order lists', () => {
    renderWithProviders(<OrdersPage />)

    const cards = screen.getByTestId('orders-card-list')
    const table = screen.getByTestId('orders-table-view')
    expectLgCardTableSplit(cards, table)
    expect(screen.getByTestId('order-row-order-abc12345')).toBeInTheDocument()
  })
})
