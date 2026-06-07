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
  })
})
