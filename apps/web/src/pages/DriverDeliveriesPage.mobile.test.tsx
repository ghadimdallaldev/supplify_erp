import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

// Mocked hooks MUST return stable references. Returning a fresh vi.fn() per call
// changes the identity of values the tracking effect depends on, so the effect
// re-runs on every render and the component never settles.
const mocks = vi.hoisted(() => {
  const noop = () => ({ unwrap: () => Promise.resolve({}) })
  const stableTuple = (fn: unknown) => [fn, { isLoading: false }] as const
  return {
    updateStatus: vi.fn(noop),
    sendLocation: vi.fn(noop),
    updateRouteStop: vi.fn(noop),
    reorderStops: vi.fn(noop),
    setNextStop: vi.fn(noop),
    buildRoute: vi.fn(noop),
    presignPod: vi.fn(noop),
    submitPod: vi.fn(noop),
    completeDelivery: vi.fn(noop),
    refetch: vi.fn(),
    refetchRoute: vi.fn(),
    boardState: { deliveryStatus: 'assigned' as string },
    extraOrders: [] as Array<{
      orderId: string
      restaurantName: string
      deliveryArea: string
      deliveryStatus: string
      assignmentId: string
      warehouseAssignmentId: string
    }>,
    routeState: null as import('../types').DeliveryRouteDetail | null,
    stableTuple,
  }
})

vi.mock('../services/api', () => {
  const board = {
    data: {
      orders: [
        {
          orderId: 'order-1',
          restaurantName: 'Cafe One',
          deliveryArea: 'Downtown',
          deliveryStatus: 'assigned',
          assignmentId: 'da-1',
          warehouseAssignmentId: 'wh-1',
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
  }
  const route = {
    data: { route: null as import('../types').DeliveryRouteDetail | null },
    isLoading: false,
    isError: false,
    refetch: mocks.refetchRoute,
  }
  return {
    useGetSupplierDeliveryBoardQuery: () => {
      board.data.orders[0].deliveryStatus = mocks.boardState.deliveryStatus
      board.data.orders.splice(1, board.data.orders.length - 1, ...mocks.extraOrders)
      return board
    },
    useGetDriverActiveRouteQuery: () => {
      route.data.route = mocks.routeState
      return route
    },
    useUpdateOrderDeliveryStatusMutation: () => mocks.stableTuple(mocks.updateStatus),
    useUpdateFulfillmentRouteStopMutation: () => mocks.stableTuple(mocks.updateRouteStop),
    useReorderFulfillmentRouteStopsMutation: () => mocks.stableTuple(mocks.reorderStops),
    useSetNextFulfillmentRouteStopMutation: () => mocks.stableTuple(mocks.setNextStop),
    useBuildDriverRouteFromAssignmentsMutation: () => mocks.stableTuple(mocks.buildRoute),
    useSendDriverLocationMutation: () => mocks.stableTuple(mocks.sendLocation),
    usePresignOrderProofOfDeliveryMutation: () => mocks.stableTuple(mocks.presignPod),
    useSubmitOrderProofOfDeliveryMutation: () => mocks.stableTuple(mocks.submitPod),
    useCompleteOrderDeliveryMutation: () => mocks.stableTuple(mocks.completeDelivery),
  }
})

const updateStatusMock = mocks.updateStatus
const boardState = mocks.boardState

beforeEach(async () => {
  updateStatusMock.mockClear()
  boardState.deliveryStatus = 'assigned'
  mocks.extraOrders.length = 0
  mocks.routeState = null
  mocks.updateRouteStop.mockClear()
  mocks.completeDelivery.mockClear()
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

  function renderPage() {
    return render(
      <I18nextProvider i18n={testI18n}>
        <MemoryRouter>
          <DriverDeliveriesPage />
        </MemoryRouter>
      </I18nextProvider>
    )
  }

  it('names the delivery the sticky bar acts on', () => {
    renderPage()
    expect(screen.getByTestId('driver-sticky-action-target')).toHaveTextContent('Cafe One')
  })

  // The departure step must send exactly out_for_delivery, and must carry the
  // assignment ids or a multi-warehouse order is rejected as ambiguous.
  it('sends out_for_delivery with assignment ids when the driver departs', async () => {
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: /i'm on the way/i })[0])

    await waitFor(() => expect(updateStatusMock).toHaveBeenCalledTimes(1))
    expect(updateStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        status: 'out_for_delivery',
        driver_assignment_id: 'da-1',
        warehouse_assignment_id: 'wh-1',
      })
    )
    // Never delivered from the departure tap.
    expect(updateStatusMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered' })
    )
  })

  // Delivering is irreversible and the API rejects it without proof when the
  // supplier requires it, so the tap must open capture, not fire the status.
  it('opens proof capture instead of delivering straight from a tap', async () => {
    boardState.deliveryStatus = 'out_for_delivery'
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: /delivered/i })[0])

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(updateStatusMock).not.toHaveBeenCalled()
  })

  it('uses the clicked warehouse leg instead of another row for the same order', async () => {
    mocks.extraOrders.push({
      orderId: 'order-1',
      restaurantName: 'Second warehouse',
      deliveryArea: 'Downtown',
      deliveryStatus: 'out_for_delivery',
      assignmentId: 'da-2',
      warehouseAssignmentId: 'wh-2',
    })
    renderPage()
    const first = screen.getAllByTestId('driver-delivery-order-1')[0]
    fireEvent.click(within(first).getByRole('button', { name: /i'm on the way/i }))
    await waitFor(() => expect(updateStatusMock).toHaveBeenCalled())
    expect(updateStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ driver_assignment_id: 'da-1', warehouse_assignment_id: 'wh-1' })
    )
  })

  it('refreshes the route after atomic proof completion without sending a second delivered request', async () => {
    boardState.deliveryStatus = 'out_for_delivery'
    mocks.routeState = {
      id: 'route-1',
      routeNumber: 'R-1',
      routeLabel: 'Route',
      driverName: 'Driver',
      status: 'IN_PROGRESS',
      scheduledDate: '2026-11-18',
      completedStops: 0,
      failedStops: 0,
      rescheduledStops: 0,
      stops: [
        {
          id: 'stop-1',
          routeId: 'route-1',
          orderId: 'order-1',
          sequenceNumber: 1,
          status: 'OUT_FOR_DELIVERY',
          restaurantName: 'Cafe One',
          totalAmount: 5,
          itemCount: 1,
        },
      ],
    }
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: /^delivered$/i })[0])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: 'Receiver' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /save proof/i }))
    await waitFor(() => expect(mocks.completeDelivery).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocks.updateRouteStop).not.toHaveBeenCalled()
    expect(mocks.refetchRoute).toHaveBeenCalled()
  })
})
