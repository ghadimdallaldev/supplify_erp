import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeliveryTrackingMap } from './DeliveryTrackingMap'

describe('DeliveryTrackingMap', () => {
  it('shows empty state without coordinates', () => {
    render(<DeliveryTrackingMap />)
    expect(screen.getByTestId('delivery-tracking-map-empty')).toHaveTextContent(
      'No GPS location received yet'
    )
  })

  it('embeds live map when coordinates exist', () => {
    render(<DeliveryTrackingMap latitude={33.8938} longitude={35.5018} live />)
    expect(screen.getByTestId('delivery-tracking-map-embed')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-tracking-map-live')).toHaveTextContent(/Live/i)
    expect(screen.queryByText(/33\.89380, 35\.50180/)).not.toBeInTheDocument()
  })

  it('shows debug coordinates only when enabled for supplier', () => {
    render(<DeliveryTrackingMap latitude={33.8938} longitude={35.5018} showCoordinateDetails />)
    expect(screen.getByTestId('delivery-tracking-map-debug')).toBeInTheDocument()
    expect(screen.getByText(/33\.89380, 35\.50180/)).toBeInTheDocument()
  })

  it('renders live status line and updated time above open in maps link', () => {
    const { getByTestId } = render(
      <DeliveryTrackingMap
        latitude={33.8938}
        longitude={35.5018}
        liveStatusLine="On the way · Live now"
        recordedAt="2026-06-03T20:03:00Z"
      />
    )
    expect(getByTestId('delivery-tracking-map-status')).toHaveTextContent('On the way · Live now')
    expect(getByTestId('delivery-tracking-map-updated')).toHaveTextContent(/Updated/i)
    expect(getByTestId('delivery-tracking-map-open')).toHaveTextContent(/Open in maps/i)
  })
})
