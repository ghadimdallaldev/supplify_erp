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
      etaAvailable: true,
      etaMinutesMin: 12,
      etaMinutesMax: 18,
      distanceKm: 4.2,
      destinationCoordinatesAvailable: true,
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
  it('renders live tracking with positive ETA', () => {
    render(
      <MemoryRouter>
        <RestaurantOrderTrackingPanel orderId="order-1" orderStatus="SHIPPED" />
      </MemoryRouter>
    )
    expect(screen.getByTestId('restaurant-order-tracking-panel')).toBeInTheDocument()
    expect(screen.getByTestId('restaurant-tracking-message')).toHaveTextContent(/on the way/i)
    expect(screen.getByTestId('delivery-tracking-map')).toBeInTheDocument()
    expect(screen.getByTestId('restaurant-tracking-eta-primary')).toHaveTextContent(
      /Arriving in about 12–18 minutes/i
    )
    expect(screen.getByTestId('restaurant-tracking-eta-secondary')).toHaveTextContent(
      /4\.2 km away/i
    )
    expect(screen.getByTestId('delivery-tracking-map-status')).toHaveTextContent(
      /On the way · Live now/i
    )
  })
})
