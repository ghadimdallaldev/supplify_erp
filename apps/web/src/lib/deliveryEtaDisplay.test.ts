import { describe, it, expect } from 'vitest'
import {
  formatDistanceKm,
  formatEtaRange,
  formatSupplierDistanceKm,
  getEtaUnavailableMessage,
  getRestaurantEtaPrimaryText,
  getRestaurantEtaSecondaryText,
  getSupplierEtaPrimaryText,
  getSupplierEtaSecondaryText,
  shouldShowEtaConfidence,
} from './deliveryEtaDisplay'
import type { RestaurantOrderTrackingResponse, SupplierOrderTrackingResponse } from '../types'

const restaurantBase: RestaurantOrderTrackingResponse = {
  orderId: 'o1',
  orderReference: 'ORD-o1',
  trackingEnabled: true,
  etaAvailable: false,
  destinationCoordinatesAvailable: true,
  delivery: { status: 'out_for_delivery', label: 'Out for delivery' },
}

const supplierBase: SupplierOrderTrackingResponse = {
  orderId: 'o1',
  trackingEnabled: true,
  etaAvailable: false,
  destinationCoordinatesAvailable: true,
  assignment: { id: 'a1', status: 'out_for_delivery' },
}

describe('deliveryEtaDisplay', () => {
  it('formats ETA range and distance', () => {
    expect(formatEtaRange(12, 18)).toBe('12–18 min')
    expect(formatDistanceKm(4.2)).toBe('4.2 km away')
    expect(formatSupplierDistanceKm(7.8)).toBe('Distance 7.8 km')
  })

  it('shows restaurant primary ETA text when available', () => {
    expect(
      getRestaurantEtaPrimaryText({
        ...restaurantBase,
        etaAvailable: true,
        etaMinutesMin: 12,
        etaMinutesMax: 18,
      })
    ).toBe('Arriving in about 12–18 minutes')
  })

  it('shows supplier primary ETA text when available', () => {
    expect(
      getSupplierEtaPrimaryText({
        ...supplierBase,
        etaAvailable: true,
        etaMinutesMin: 12,
        etaMinutesMax: 18,
      })
    ).toBe('ETA 12–18 min')
    expect(
      getSupplierEtaSecondaryText({
        ...supplierBase,
        etaAvailable: true,
        distanceKm: 7.8,
      })
    ).toBe('Distance 7.8 km')
  })

  it('shows missing destination warning', () => {
    expect(
      getEtaUnavailableMessage({
        ...restaurantBase,
        destinationCoordinatesAvailable: false,
      })
    ).toBe('ETA unavailable — restaurant delivery location is not set.')
  })

  it('shows start delivery message for assigned status', () => {
    expect(
      getEtaUnavailableMessage({
        ...restaurantBase,
        delivery: { status: 'assigned', label: 'Assigned' },
      })
    ).toBe('ETA will appear once the driver starts delivery.')
  })

  it('shows restaurant copy when delivery is later on route', () => {
    expect(
      getRestaurantEtaPrimaryText({
        ...restaurantBase,
        etaAvailable: true,
        etaMinutesMin: 35,
        etaMinutesMax: 50,
        nextStop: false,
        stopsBefore: 2,
      })
    ).toBe('Your delivery is planned after 2 stops')
    expect(
      getRestaurantEtaSecondaryText({
        ...restaurantBase,
        etaAvailable: true,
        etaMinutesMin: 35,
        etaMinutesMax: 50,
        nextStop: false,
        stopsBefore: 2,
      })
    ).toBe('Estimated arrival: 35–50 minutes')
  })

  it('shows supplier route position hints', () => {
    expect(
      getSupplierEtaSecondaryText({
        ...supplierBase,
        etaAvailable: true,
        distanceKm: 7.8,
        stopsBefore: 2,
        routePosition: 3,
        routePositionTotal: 10,
      })
    ).toBe('2 stops before this order · Route position 3 of 10 · Distance 7.8 km')
  })

  it('shows low confidence badge hint for supplier', () => {
    expect(
      shouldShowEtaConfidence({
        ...supplierBase,
        etaAvailable: true,
        confidence: 'LOW',
        etaMinutesMin: 10,
        etaMinutesMax: 15,
      })
    ).toBe(true)
  })
})
