import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, cleanup } from '@testing-library/react'
import { FulfillmentTrackingTab } from './FulfillmentTrackingTab'
import { renderWithFulfillmentI18n } from './test-utils'

vi.mock('../../services/api', () => ({
  useGetMeQuery: () => ({ data: undefined }),
  useGetOrderTrackingQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useGetSupplierDeliveryBoardQuery: () => ({
    data: {
      orders: [
        {
          orderId: 'order-abc-1234',
          restaurantName: 'Test Cafe',
          driverName: 'Alex',
          deliveryArea: 'Downtown',
          scheduledAt: '2026-06-02T22:00:00Z',
          scheduledDeliveryDate: '2026-06-03',
          deliveryStatus: 'out_for_delivery',
          destinationLatitude: 33.91,
          destinationLongitude: 35.52,
          etaAvailable: true,
          tracking: {
            enabled: true,
            hasLocation: true,
            lastSeenAt: '2026-06-03T10:00:00Z',
            isStale: false,
            latestLocation: {
              latitude: 33.89,
              longitude: 35.5,
              recordedAt: '2026-06-03T10:00:00Z',
            },
            lastUpdatedLabel: '1 minute ago',
          },
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('../maps/ActiveDeliveriesMap', () => ({
  ActiveDeliveriesMap: ({ onSelectOrder }: { onSelectOrder: (id: string) => void }) => (
    <button
      type="button"
      data-testid="active-deliveries-map-mock"
      onClick={() => onSelectOrder('order-abc-1234')}
    >
      Map mock
    </button>
  ),
}))

describe('FulfillmentTrackingTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders GPS column and opens tracking drawer from board', () => {
    renderWithFulfillmentI18n(<FulfillmentTrackingTab />)
    expect(screen.getByTestId('tracking-gps-status')).toHaveTextContent(/Live/i)
    fireEvent.click(screen.getAllByTestId('tracking-view-order-abc-1234')[0])
    expect(screen.getByTestId('delivery-tracking-drawer')).toBeInTheDocument()
  })

  it('displays the canonical delivery day without deriving it from the legacy UTC timestamp', () => {
    renderWithFulfillmentI18n(<FulfillmentTrackingTab />)
    const day = new Date(2026, 5, 3, 12).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    expect(screen.getAllByText(day).length).toBeGreaterThan(0)
  })

  it('switches to map view and opens drawer from map selection', async () => {
    renderWithFulfillmentI18n(<FulfillmentTrackingTab />)
    fireEvent.click(screen.getByTestId('fulfillment-tracking-map-view'))
    // The map is lazy-loaded (React.lazy + Suspense), so wait for the chunk to resolve.
    fireEvent.click(await screen.findByTestId('active-deliveries-map-mock'))
    expect(screen.getByTestId('delivery-tracking-drawer')).toBeInTheDocument()
  })
})
