import {
  formatEtaRange,
  getRestaurantEtaPrimaryText,
  getRestaurantEtaSecondaryText,
  getEtaUnavailableMessage,
  isDestinationMissingEtaUnavailable,
} from '../utils/deliveryEtaDisplay'
import type { RestaurantOrderTrackingResponse } from '../types/supplify'

describe('deliveryEtaDisplay', () => {
  it('formatEtaRange handles equal min/max', () => {
    expect(formatEtaRange(15, 15)).toBe('15 min')
    expect(formatEtaRange(12, 18)).toBe('12–18 min')
  })

  it('formats restaurant ETA copy', () => {
    const data: RestaurantOrderTrackingResponse = {
      orderId: '1',
      trackingEnabled: true,
      etaAvailable: true,
      etaMinutesMin: 12,
      etaMinutesMax: 18,
      distanceKm: 4.2,
    }
    expect(getRestaurantEtaPrimaryText(data)).toBe('Arriving in about 12–18 minutes')
  })

  it('shows unavailable when destination missing', () => {
    const data: RestaurantOrderTrackingResponse = {
      orderId: '1',
      trackingEnabled: true,
      etaAvailable: false,
      destinationCoordinatesAvailable: false,
    }
    expect(getEtaUnavailableMessage(data)).toContain('delivery location not set')
    expect(isDestinationMissingEtaUnavailable(data)).toBe(true)
  })

  it('shows multi-stop ETA copy when not next stop', () => {
    const data: RestaurantOrderTrackingResponse = {
      orderId: '1',
      trackingEnabled: true,
      etaAvailable: true,
      etaMinutesMin: 20,
      etaMinutesMax: 30,
      nextStop: false,
      stopsBefore: 2,
    }
    expect(getRestaurantEtaPrimaryText(data)).toContain('2 stops')
    expect(getRestaurantEtaSecondaryText(data)).toContain('Estimated arrival')
  })
})
