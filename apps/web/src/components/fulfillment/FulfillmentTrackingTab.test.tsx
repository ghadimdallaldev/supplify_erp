import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('FulfillmentTrackingTab', () => {
  it('renders GPS column and opens tracking drawer', () => {
    render(<FulfillmentTrackingTab />)
    expect(screen.getByTestId('tracking-gps-status')).toHaveTextContent(/Live/i)
    fireEvent.click(screen.getByTestId('tracking-view-order-abc-1234'))
    expect(screen.getByTestId('delivery-tracking-drawer')).toBeInTheDocument()
  })
})
