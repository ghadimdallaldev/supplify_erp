import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { DriverDeliveriesPage } from '../pages/DriverDeliveriesPage'
import { ensureTestI18n, testI18n } from '../test/i18n'

vi.mock('../hooks/redux', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      auth: {
        user: {
          role: 'SUPPLIER',
          tenantPermissions: ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
        },
      },
    }),
}))

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
  }),
}))

vi.mock('../services/api', () => ({
  useGetSupplierDeliveryBoardQuery: () => ({
    data: {
      orders: [
        {
          orderId: 'order-1',
          restaurantName: 'Cafe One',
          deliveryArea: 'Downtown',
          deliveryStatus: 'assigned',
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGetDriverActiveRouteQuery: () => ({
    data: { route: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateOrderDeliveryStatusMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateFulfillmentRouteStopMutation: () => [vi.fn()],
  useReorderFulfillmentRouteStopsMutation: () => [vi.fn(), { isLoading: false }],
  useSetNextFulfillmentRouteStopMutation: () => [vi.fn(), { isLoading: false }],
  useBuildDriverRouteFromAssignmentsMutation: () => [vi.fn(), { isLoading: false }],
  useSendDriverLocationMutation: () => [vi.fn(), { isLoading: false }],
}))

beforeEach(async () => {
  await ensureTestI18n()
  Object.defineProperty(global.navigator, 'geolocation', {
    value: {
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    },
    configurable: true,
  })
})

describe('DriverDeliveriesPage mobile', () => {
  it('renders assigned deliveries with touch-friendly actions at narrow width', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 320 })

    render(
      <I18nextProvider i18n={testI18n}>
        <MemoryRouter>
          <div style={{ width: 320 }}>
            <DriverDeliveriesPage />
          </div>
        </MemoryRouter>
      </I18nextProvider>
    )

    expect(screen.getByTestId('driver-deliveries-page')).toBeInTheDocument()
    expect(screen.getByTestId('driver-delivery-order-1')).toBeInTheDocument()
    expect(screen.getByTestId('driver-deliveries-header')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /i'm on the way/i }).length
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: /open maps/i })).toBeInTheDocument()
    expect(screen.getByTestId('driver-sticky-action-bar')).toBeInTheDocument()
  })
})
