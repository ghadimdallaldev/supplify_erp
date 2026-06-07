import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DeliveryTrackingMap } from './DeliveryTrackingMap'

const fitToMarkers = vi.fn()

vi.mock('./useDeliveryLeafletMap', () => ({
  useDeliveryLeafletMap: () => ({
    containerRef: { current: null },
    fitToMarkers,
  }),
}))

describe('DeliveryTrackingMap', () => {
  beforeEach(() => {
    fitToMarkers.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows empty state without coordinates', () => {
    render(<DeliveryTrackingMap />)
    expect(screen.getByTestId('delivery-tracking-map-empty')).toHaveTextContent(
      'No GPS location received yet'
    )
  })

  it('renders recenter button with driver coordinates', () => {
    render(<DeliveryTrackingMap latitude={33.8938} longitude={35.5018} live />)
    expect(screen.getByTestId('delivery-tracking-map-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-tracking-map-recenter')).toHaveTextContent(/Recenter/i)
    expect(screen.getByTestId('delivery-tracking-map-live')).toHaveTextContent(/Live/i)
  })

  it('recenter calls fitToMarkers', () => {
    render(<DeliveryTrackingMap latitude={33.8938} longitude={35.5018} />)
    fireEvent.click(screen.getByTestId('delivery-tracking-map-recenter'))
    expect(fitToMarkers).toHaveBeenCalled()
  })

  it('shows destination-only map and waiting message', () => {
    render(
      <DeliveryTrackingMap
        destinationLatitude={33.9}
        destinationLongitude={35.51}
        destinationLabel="Main kitchen"
      />
    )
    expect(screen.getByTestId('delivery-tracking-map-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-tracking-map-waiting-gps')).toHaveTextContent(
      /Waiting for driver location/i
    )
  })

  it('shows both driver and destination legend entries', () => {
    render(
      <DeliveryTrackingMap
        latitude={33.8938}
        longitude={35.5018}
        destinationLatitude={33.91}
        destinationLongitude={35.52}
        destinationLabel="Delivery location"
      />
    )
    expect(screen.getByTestId('delivery-tracking-map-legend')).toHaveTextContent(/Driver/i)
    expect(screen.getByTestId('delivery-tracking-map-legend')).toHaveTextContent(
      /Delivery location/i
    )
  })

  it('hides destination pin when showDestinationPin is false', () => {
    render(
      <DeliveryTrackingMap
        latitude={33.8938}
        longitude={35.5018}
        destinationLatitude={33.91}
        destinationLongitude={35.52}
        showDestinationPin={false}
      />
    )
    expect(screen.queryByTestId('delivery-tracking-map-waiting-gps')).not.toBeInTheDocument()
    expect(screen.getByTestId('delivery-tracking-map-legend')).not.toHaveTextContent(
      /Delivery location/i
    )
  })

  it('shows debug coordinates only when enabled for supplier', () => {
    render(
      <DeliveryTrackingMap
        latitude={33.8938}
        longitude={35.5018}
        destinationLatitude={33.91}
        destinationLongitude={35.52}
        showCoordinateDetails
      />
    )
    expect(screen.getByTestId('delivery-tracking-map-debug')).toBeInTheDocument()
    expect(screen.getByText(/Driver: 33\.89380, 35\.50180/)).toBeInTheDocument()
    expect(screen.getByText(/Destination: 33\.91000, 35\.52000/)).toBeInTheDocument()
  })

  it('shows delivery location not set when driver exists without destination', () => {
    render(<DeliveryTrackingMap latitude={33.8938} longitude={35.5018} showDestinationPin />)
    expect(screen.getByTestId('delivery-tracking-map-no-destination')).toHaveTextContent(
      /Delivery location not set/i
    )
  })
})
