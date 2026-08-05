import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FulfillmentRouteDetailPanel } from './FulfillmentRouteDetailPanel'
import { renderWithFulfillmentI18n } from './test-utils'
import type { DeliveryRouteDetail } from '../../types'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (perm: string) => perm === 'FULFILLMENT_MANAGE',
    canAny: () => true,
  }),
}))

const mutate = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))

vi.mock('../../services/api', () => ({
  useReorderFulfillmentRouteStopsMutation: () => [mutate, { isLoading: false }],
  useOptimizeFulfillmentRouteMutation: () => [mutate, { isLoading: false }],
  useSetNextFulfillmentRouteStopMutation: () => [mutate, { isLoading: false }],
  useUpdateFulfillmentRouteMutation: () => [mutate, { isLoading: false }],
  useUpdateFulfillmentRouteStopMutation: () => [mutate, { isLoading: false }],
  useCancelFulfillmentRouteMutation: () => [mutate, { isLoading: false }],
}))

const route: DeliveryRouteDetail = {
  id: 'route-1',
  routeNumber: 'R-20260608-001',
  routeLabel: 'Downtown run',
  area: 'Downtown',
  driverId: 'driver-1',
  driverName: 'Alex Driver',
  vehicle: null,
  status: 'IN_PROGRESS',
  scheduledDate: '2026-06-08',
  completedStops: 0,
  failedStops: 0,
  rescheduledStops: 0,
  stops: [
    {
      id: 'stop-1',
      routeId: 'route-1',
      orderId: 'order-abc12345',
      orderNumber: 'ORD-ABC12345',
      sequenceNumber: 1,
      status: 'OUT_FOR_DELIVERY',
      restaurantName: 'Cafe Roma',
      deliveryArea: 'Downtown',
      addressLine: '12 Main St',
      totalAmount: 48.5,
      itemCount: 3,
      tracking: {
        enabled: true,
        hasLocation: true,
        lastSeenAt: '2026-06-08T10:00:00Z',
        isStale: false,
        latestLocation: {
          latitude: 1,
          longitude: 2,
          recordedAt: '2026-06-08T10:00:00Z',
        },
        lastUpdatedLabel: '2 min ago',
      },
      etaAvailable: true,
      etaMinutesMin: 10,
      etaMinutesMax: 15,
      isNext: true,
    },
    {
      id: 'stop-2',
      routeId: 'route-1',
      orderId: 'order-def67890',
      orderNumber: 'ORD-DEF67890',
      sequenceNumber: 2,
      status: 'PLANNED',
      restaurantName: 'Bistro Blue',
      deliveryArea: 'Uptown',
      addressLine: '99 Oak Ave',
      totalAmount: 22,
      itemCount: 1,
    },
  ],
}

afterEach(() => {
  cleanup()
})

describe('FulfillmentRouteDetailPanel mobile polish', () => {
  it('shows plain route and stop labels with ETA and GPS', () => {
    renderWithFulfillmentI18n(
      <MemoryRouter>
        <FulfillmentRouteDetailPanel route={route} onClose={vi.fn()} />
      </MemoryRouter>
    )

    const stop1 = screen.getByTestId('fulfillment-route-stop-stop-1')
    expect(stop1).toHaveTextContent('On the way')
    expect(stop1).toHaveTextContent('Cafe Roma')
    expect(stop1).toHaveTextContent('ORD-ABC12345')
    expect(screen.getByTestId('stop-eta')).toHaveTextContent('ETA 10–15 min')
    expect(screen.getByTestId('stop-gps')).toHaveTextContent(/live now/i)
    expect(screen.getByTestId('fulfillment-route-stop-stop-2')).toHaveTextContent(
      'Ready for dispatch'
    )
  })

  it('expands secondary stop details on demand', () => {
    renderWithFulfillmentI18n(
      <MemoryRouter>
        <FulfillmentRouteDetailPanel route={route} onClose={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTestId('stop-details-toggle-stop-1'))
    expect(screen.getByTestId('stop-details-stop-1')).toHaveTextContent('12 Main St')
    expect(screen.getByTestId('stop-details-stop-1')).toHaveTextContent('3 items')
  })

  it('renders touch-friendly primary action on mobile stops', () => {
    renderWithFulfillmentI18n(
      <MemoryRouter>
        <FulfillmentRouteDetailPanel route={route} onClose={vi.fn()} />
      </MemoryRouter>
    )

    const primaryBtn = screen.getByTestId('stop-primary-action-stop-1')
    expect(primaryBtn).toHaveTextContent('Delivered')
    expect(primaryBtn.className).toMatch(/min-h-\[44px\]/)
  })
})
