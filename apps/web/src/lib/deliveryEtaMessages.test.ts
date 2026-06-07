import { describe, it, expect } from 'vitest'
import { getEtaUnavailableMessage } from './deliveryEtaMessages'
import type { RestaurantOrderTrackingResponse } from '../types'

const base: RestaurantOrderTrackingResponse = {
  orderId: 'o1',
  orderReference: 'ORD-o1',
  trackingEnabled: true,
  etaAvailable: false,
  destinationCoordinatesAvailable: false,
  delivery: { status: 'out_for_delivery', label: 'Out for delivery' },
}

describe('deliveryEtaMessages', () => {
  it('shows missing destination warning', () => {
    expect(getEtaUnavailableMessage(base)).toBe(
      'ETA unavailable — restaurant delivery location is not set.'
    )
  })

  it('shows start delivery message when destination exists but ETA not ready', () => {
    expect(
      getEtaUnavailableMessage({
        ...base,
        destinationCoordinatesAvailable: true,
      })
    ).toBe('ETA will appear once the driver starts delivery.')
  })

  it('returns null when ETA is ready', () => {
    expect(
      getEtaUnavailableMessage({
        ...base,
        destinationCoordinatesAvailable: true,
        etaAvailable: true,
      })
    ).toBeNull()
  })
})
