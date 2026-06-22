import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { RestaurantOrderTrackingPanel } from './RestaurantOrderTrackingPanel'
import { testI18n, resetTestI18n } from '../../test/i18n'

vi.mock('../maps/LazyDeliveryTrackingMap', () => ({
  LazyDeliveryTrackingMap: ({ beforeFooter, liveStatusLine }: any) => (
    <div data-testid="delivery-tracking-map">
      {beforeFooter}
      <span data-testid="delivery-tracking-map-status">{liveStatusLine ?? ''}</span>
    </div>
  ),
}))

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

const ft = (key: string, options?: Record<string, unknown>) =>
  testI18n.t(key, { ns: 'fulfillment', ...options })

const ot = (key: string, options?: Record<string, unknown>) =>
  testI18n.t(key, { ns: 'orders', ...options })

function renderPanel() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter>
        <RestaurantOrderTrackingPanel orderId="order-1" orderStatus="SHIPPED" />
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe('RestaurantOrderTrackingPanel', () => {
  beforeEach(async () => {
    await resetTestI18n()
  })

  it('renders live tracking with positive ETA', async () => {
    renderPanel()
    expect(screen.getByTestId('restaurant-order-tracking-panel')).toBeInTheDocument()
    expect(screen.getByTestId('restaurant-tracking-message')).toHaveTextContent(
      ot('tracking.messages.liveWithTime', { time: '1 minute ago' })
    )
    expect(screen.getByTestId('delivery-tracking-map')).toBeInTheDocument()
    expect(screen.getByTestId('restaurant-tracking-eta-primary')).toHaveTextContent(
      ft('tracking.eta.restaurant.arrivingIn', {
        range: ft('tracking.eta.minutesRange', { min: 12, max: 18 }),
      })
    )
    expect(screen.getByTestId('restaurant-tracking-eta-secondary')).toHaveTextContent(
      ft('tracking.eta.distanceKm', { km: '4.2' })
    )
    expect(screen.getByTestId('delivery-tracking-map-status')).toHaveTextContent(
      ft('tracking.gps.onTheWayLive')
    )
    expect(screen.getByTestId('restaurant-gps-status')).toHaveTextContent(
      ft('tracking.gps.liveNowWithTime', { time: '1 minute ago' })
    )
  })
})
