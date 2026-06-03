import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RestaurantOrderTrackingPanel } from './RestaurantOrderTrackingPanel'

vi.mock('../../services/api', () => ({
  useGetOrderTrackingQuery: () => ({
    data: {
      orderId: 'order-1',
      orderReference: 'ORD-order-1',
      trackingEnabled: true,
      etaAvailable: false,
      delivery: { status: 'out_for_delivery', label: 'Out for delivery' },
      tracking: {
        enabled: true,
        hasLocation: true,
        lastSeenAt: '2026-06-03T10:00:00Z',
        isStale: false,
        latestLocation: {
          latitude: 33.8938,
          longitude: 35.5018,
          recordedAt: '2026-06-03T10:00:00Z',
        },
        lastUpdatedLabel: '1 minute ago',
      },
    },
    isLoading: false,
    isError: false,
  }),
}))

describe('RestaurantOrderTrackingPanel', () => {
  it('renders live tracking with map fallback', () => {
    render(
      <MemoryRouter>
        <RestaurantOrderTrackingPanel orderId="order-1" orderStatus="SHIPPED" />
      </MemoryRouter>
    )
    expect(screen.getByTestId('restaurant-order-tracking-panel')).toBeInTheDocument()
    expect(screen.getByTestId('restaurant-tracking-message')).toHaveTextContent(/on the way/i)
    expect(screen.getByTestId('delivery-tracking-map-fallback')).toBeInTheDocument()
  })
})
