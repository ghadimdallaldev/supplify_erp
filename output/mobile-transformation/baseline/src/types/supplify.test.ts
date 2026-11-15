import { isRestaurantOrderTracking } from './supplify'
import type { OrderTrackingResponse } from './supplify'

describe('supplify type guards', () => {
  it('detects restaurant tracking payload', () => {
    const restaurant: OrderTrackingResponse = {
      orderId: '1',
      orderReference: 'ORD-1',
      trackingEnabled: true,
      etaAvailable: false,
    }
    expect(isRestaurantOrderTracking(restaurant)).toBe(true)
  })

  it('detects supplier tracking payload', () => {
    const supplier: OrderTrackingResponse = {
      orderId: '1',
      trackingEnabled: true,
      etaAvailable: false,
      assignment: { status: 'out_for_delivery' },
    }
    expect(isRestaurantOrderTracking(supplier)).toBe(false)
  })

  it('handles undefined', () => {
    expect(isRestaurantOrderTracking(undefined)).toBe(false)
  })
})
