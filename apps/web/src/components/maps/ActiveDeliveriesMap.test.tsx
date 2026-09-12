import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActiveDeliveriesMap } from './ActiveDeliveriesMap'

vi.mock('./useDeliveryLeafletMap', () => ({
  useDeliveryLeafletMap: () => ({
    containerRef: { current: null },
    fitToMarkers: vi.fn(),
  }),
}))

describe('ActiveDeliveriesMap', () => {
  it('shows empty state with no orders', () => {
    render(<ActiveDeliveriesMap orders={[]} onSelectOrder={vi.fn()} />)
    expect(screen.getByTestId('active-deliveries-map-empty')).toBeInTheDocument()
  })

  it('renders summary and opens drawer via list click', () => {
    const onSelect = vi.fn()
    render(
      <ActiveDeliveriesMap
        orders={[
          {
            orderId: 'order-1',
            restaurantName: 'Cafe A',
            deliveryStatus: 'out_for_delivery',
            destinationLatitude: 33.9,
            destinationLongitude: 35.5,
            etaAvailable: true,
            tracking: {
              hasLocation: true,
              isStale: false,
              latestLocation: { latitude: 33.89, longitude: 35.49 },
            },
          },
          {
            orderId: 'order-2',
            restaurantName: 'Cafe B',
            deliveryStatus: 'assigned',
            tracking: { hasLocation: false, isStale: false },
          },
        ]}
        onSelectOrder={onSelect}
      />
    )
    expect(screen.getByTestId('active-deliveries-map-summary')).toHaveTextContent('1')
    expect(screen.getByTestId('active-deliveries-map-recenter')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('active-delivery-map-item-order-1'))
    expect(onSelect).toHaveBeenCalledWith('order-1')
  })
})
