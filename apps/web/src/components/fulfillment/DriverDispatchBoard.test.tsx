import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DriverDispatchBoard } from './DriverDispatchBoard'
import { FulfillmentDispatchFilters } from './FulfillmentDispatchFilters'
import { DISPATCH_FILTER_ALL } from './fulfillmentDispatchUtils'
import type { DispatchOrderCard } from '../../types'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (key: string) => key === 'FULFILLMENT_MANAGE',
    canAny: () => true,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('../../services/api', () => ({
  useGetDriversQuery: () => ({
    data: { drivers: [{ id: 'd1', fullName: 'Alex Driver' }] },
  }),
  useGetOrderTrackingQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useAssignDriverToOrderMutation: () => [vi.fn(), { isLoading: false }],
  useReassignDriverOnOrderMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateOrderDeliveryStatusMutation: () => [vi.fn(), { isLoading: false }],
  useSubmitOrderProofOfDeliveryMutation: () => [vi.fn(), { isLoading: false }],
  useCreateFulfillmentRouteMutation: () => [vi.fn(), { isLoading: false }],
  useRolloverAssignmentToTomorrowMutation: () => [vi.fn(), { isLoading: false }],
}))

const order: DispatchOrderCard = {
  id: 'order-12345678-abcd',
  status: 'SHIPPED',
  total_amount: 250,
  created_at: '2026-05-28T12:00:00Z',
  restaurant_name: 'Cedar Kitchen',
  item_count: 4,
  delivery_area: 'Downtown',
  assignment: null,
  tracking: {
    enabled: true,
    hasLocation: true,
    lastSeenAt: '2026-06-03T10:00:00.000Z',
    isStale: false,
    latestLocation: {
      latitude: 33.89,
      longitude: 35.5,
      recordedAt: '2026-06-03T10:00:00.000Z',
    },
    lastUpdatedLabel: '2 minutes ago',
  },
}

const boardData = {
  pending: [order],
  assigned: [],
  out_for_delivery: [],
  delivered_today: [],
  stats: { pending: 1, assigned: 0, outForDelivery: 0, deliveredToday: 0 },
}

const summary = {
  total: 1,
  pending: 1,
  outForDelivery: 0,
  delivered: 0,
  failed: 0,
  rescheduled: 0,
}

describe('DriverDispatchBoard UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders filter bar with native status select (not expanded option list)', () => {
    render(
      <FulfillmentDispatchFilters
        filters={{
          date: '',
          status: DISPATCH_FILTER_ALL,
          driverId: DISPATCH_FILTER_ALL,
          area: '',
        }}
        onChange={vi.fn()}
        onClear={vi.fn()}
        drivers={[{ id: 'd1', fullName: 'Alex' }]}
      />
    )
    expect(screen.getByTestId('fulfillment-dispatch-filters')).toBeInTheDocument()
    const statusSelect = screen.getByTestId('delivery-filter-status')
    expect(statusSelect.tagName).toBe('SELECT')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  const renderBoard = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

  it('renders summary stats and order card with status badge', () => {
    renderBoard(
      <DriverDispatchBoard data={boardData} summary={summary} isLoading={false} isError={false} />
    )
    expect(screen.getByTestId('delivery-board-stats')).toBeInTheDocument()
    expect(screen.getByText('Total orders')).toBeInTheDocument()
    expect(screen.getByTestId('dispatch-order-order-12345678-abcd')).toBeInTheDocument()
    expect(screen.getByTestId('dispatch-order-status')).toBeInTheDocument()
    expect(screen.getByText('Cedar Kitchen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /assign driver/i })).toBeInTheDocument()
  })

  it('renders empty state when no orders', () => {
    renderBoard(
      <DriverDispatchBoard
        data={{
          pending: [],
          assigned: [],
          out_for_delivery: [],
          delivered_today: [],
          stats: { pending: 0, assigned: 0, outForDelivery: 0, deliveredToday: 0 },
        }}
        summary={{
          total: 0,
          pending: 0,
          outForDelivery: 0,
          delivered: 0,
          failed: 0,
          rescheduled: 0,
        }}
        filtersActive
        onClearFilters={vi.fn()}
      />
    )
    expect(screen.getByTestId('dispatch-board-empty')).toHaveTextContent(
      /no deliveries match these filters/i
    )
    expect(screen.getByTestId('dispatch-board-empty').querySelector('button')).toBeTruthy()
  })

  it('renders error state with retry', () => {
    renderBoard(<DriverDispatchBoard data={null} summary={summary} isError onRetry={vi.fn()} />)
    expect(screen.getByTestId('dispatch-board-error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows GPS status and view tracking on dispatch cards', () => {
    renderBoard(
      <DriverDispatchBoard data={boardData} summary={summary} isLoading={false} isError={false} />
    )
    const cards = screen.getAllByTestId('dispatch-order-order-12345678-abcd')
    expect(cards[0].querySelector('[data-testid="dispatch-gps-status"]')).toHaveTextContent(/Live/i)
    expect(
      screen.getAllByTestId('dispatch-view-tracking-order-12345678-abcd').length
    ).toBeGreaterThan(0)
  })
})
