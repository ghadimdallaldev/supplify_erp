import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DriverDispatchBoard } from './DriverDispatchBoard'
import type { DispatchOrderCard } from '../../types'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => false,
    canAny: () => false,
    isWorkspaceViewer: true,
  }),
}))

vi.mock('../../services/api', () => ({
  useGetDriversQuery: () => ({ data: { drivers: [] } }),
  useGetOrderTrackingQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useAssignDriverToOrderMutation: () => [vi.fn(), { isLoading: false }],
  useReassignDriverOnOrderMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateOrderDeliveryStatusMutation: () => [vi.fn(), { isLoading: false }],
  useSubmitOrderProofOfDeliveryMutation: () => [vi.fn(), { isLoading: false }],
  useCreateFulfillmentRouteMutation: () => [vi.fn(), { isLoading: false }],
  useRolloverAssignmentToTomorrowMutation: () => [vi.fn(), { isLoading: false }],
}))

const order: DispatchOrderCard = {
  id: 'order-abc',
  status: 'SHIPPED',
  total_amount: 100,
  created_at: '2026-05-28T12:00:00Z',
  restaurant_name: 'Test Cafe',
  item_count: 2,
}

describe('DriverDispatchBoard viewer role', () => {
  it('does not show assign driver action', () => {
    render(
      <MemoryRouter>
        <DriverDispatchBoard
          data={{
            pending: [order],
            assigned: [],
            out_for_delivery: [],
            delivered_today: [],
            stats: { pending: 1, assigned: 0, outForDelivery: 0, deliveredToday: 0 },
          }}
          summary={{
            total: 1,
            pending: 1,
            outForDelivery: 0,
            delivered: 0,
            failed: 0,
            rescheduled: 0,
          }}
        />
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: /assign driver/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view order/i })).toBeInTheDocument()
  })
})
