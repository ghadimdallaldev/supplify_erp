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

  it('shows fallback link when map key missing', () => {
    render(<DeliveryTrackingMap latitude={33.8938} longitude={35.5018} />)
    expect(screen.getByTestId('delivery-tracking-map-fallback')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open in Google Maps/i })).toHaveAttribute(
      'href',
      expect.stringContaining('33.8938')
    )
  })
})
