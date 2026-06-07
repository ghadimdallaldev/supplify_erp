import { describe, it, expect } from 'vitest'
import {
  buildDestinationPayload,
  computeEtaReadiness,
  resolveDestinationFromOrderRow,
  validateDeliveryCoordinates,
} from './delivery-coordinates.js'

describe('delivery-coordinates', () => {
  it('allows null coordinates', () => {
    expect(validateDeliveryCoordinates(null, null)).toEqual({
      latitude: null,
      longitude: null,
    })
  })

  it('rejects partial coordinates', () => {
    expect(() => validateDeliveryCoordinates(33.89, null)).toThrow(/both be set/)
  })

  it('rejects invalid latitude', () => {
    expect(() => validateDeliveryCoordinates(120, 35.5)).toThrow(/out of range/)
  })

  it('rejects invalid longitude', () => {
    expect(() => validateDeliveryCoordinates(33.89, 200)).toThrow(/out of range/)
  })

  it('prefers branch coordinates over restaurant fallback', () => {
    const dest = resolveDestinationFromOrderRow({
      branch_delivery_latitude: '33.9000000',
      branch_delivery_longitude: '35.5000000',
      branch_delivery_location_label: 'Marina gate',
      branch_name: 'Marina',
      restaurant_delivery_latitude: '33.1000000',
      restaurant_delivery_longitude: '35.1000000',
      restaurant_delivery_location_label: 'HQ',
      restaurant_name: 'Cafe',
    })
    expect(dest?.latitude).toBe(33.9)
    expect(dest?.source).toBe('branch')
    expect(dest?.label).toBe('Marina gate')
  })

  it('falls back to restaurant coordinates', () => {
    const dest = resolveDestinationFromOrderRow({
      branch_delivery_latitude: null,
      branch_delivery_longitude: null,
      restaurant_delivery_latitude: '33.8938000',
      restaurant_delivery_longitude: '35.5018000',
      restaurant_delivery_location_label: 'Main entrance',
      restaurant_name: 'Cafe One',
    })
    expect(dest?.source).toBe('restaurant')
    expect(dest?.latitude).toBeCloseTo(33.8938)
  })

  it('returns unavailable destination when coords missing', () => {
    expect(buildDestinationPayload(resolveDestinationFromOrderRow({})).coordinatesAvailable).toBe(
      false
    )
  })

  it('computeEtaReadiness requires driver and destination', () => {
    const tracking = {
      hasLocation: true,
      latestLocation: { latitude: 33.89, longitude: 35.5 },
    }
    const destination = { latitude: 33.9, longitude: 35.51 }
    expect(computeEtaReadiness(tracking, destination)).toBe(true)
    expect(computeEtaReadiness(tracking, null)).toBe(false)
    expect(computeEtaReadiness({ hasLocation: false, latestLocation: null }, destination)).toBe(
      false
    )
  })

  it('omits lat/lng in restaurant-safe destination payload', () => {
    const payload = buildDestinationPayload(
      { latitude: 33.89, longitude: 35.5, label: 'Gate A' },
      { includeCoordinates: false }
    )
    expect(payload.coordinatesAvailable).toBe(true)
    expect(payload.label).toBe('Gate A')
    expect(payload).not.toHaveProperty('latitude')
  })

  it('includes lat/lng for supplier fulfillment payload', () => {
    const payload = buildDestinationPayload(
      { latitude: 33.89, longitude: 35.5, label: 'Gate A' },
      { includeCoordinates: true }
    )
    expect(payload.latitude).toBe(33.89)
    expect(payload.longitude).toBe(35.5)
  })
})
