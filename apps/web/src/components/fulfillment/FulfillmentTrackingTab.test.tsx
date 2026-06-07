import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FulfillmentTrackingTab } from './FulfillmentTrackingTab'

vi.mock('../../services/api', () => ({
  useGetOrderTrackingQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useGetSupplierDeliveryBoardQuery: () => ({
    data: {
      orders: [
        {
          orderId: 'order-abc-1234',
          restaurantName: 'Test Cafe',
          driverName: 'Alex',
          deliveryArea: 'Downtown',
          scheduledAt: '2026-06-03T10:00:00Z',
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
    render(<FulfillmentTrackingTab />)
    expect(screen.getByTestId('tracking-gps-status')).toHaveTextContent(/Live/i)
    fireEvent.click(screen.getByTestId('tracking-view-order-abc-1234'))
    expect(screen.getByTestId('delivery-tracking-drawer')).toBeInTheDocument()
  })

  it('switches to map view and opens drawer from map selection', () => {
    render(<FulfillmentTrackingTab />)
    fireEvent.click(screen.getByTestId('fulfillment-tracking-map-view'))
    fireEvent.click(screen.getByTestId('active-deliveries-map-mock'))
    expect(screen.getByTestId('delivery-tracking-drawer')).toBeInTheDocument()
  })
})
