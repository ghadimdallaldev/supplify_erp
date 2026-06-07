import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    GPS_RESTAURANT_SHOW_DRIVER_NAME: true,
    GPS_RESTAURANT_SHOW_DRIVER_PHONE: false,
  },
}))

import {
  buildRestaurantTrackingDisabledResponse,
  buildRestaurantTrackingResponse,
} from './restaurant-tracking-payload.js'

describe('restaurant-tracking-payload', () => {
  beforeEach(async () => {
    const { config } = await import('../config/env.js')
    config.GPS_RESTAURANT_SHOW_DRIVER_NAME = true
    config.GPS_RESTAURANT_SHOW_DRIVER_PHONE = false
  })

  it('returns disabled response with reason', () => {
    const res = buildRestaurantTrackingDisabledResponse('order-uuid-1234')
    expect(res.trackingEnabled).toBe(false)
    expect(res.reason).toBe('restaurant_tracking_disabled')
    expect(res.orderReference).toContain('ORD-')
    expect(res).not.toHaveProperty('routeId')
  })

  it('sanitizes active tracking without route fields', () => {
    const res = buildRestaurantTrackingResponse({
      orderId: 'order-uuid-1234',
      orderStatus: 'SHIPPED',
      assignment: {
        status: 'out_for_delivery',
        driver_name: 'Ali Hassan',
        driver_phone: '+961123',
        assigned_at: '2026-06-03T09:00:00Z',
      },
      tracking: {
        enabled: true,
        hasLocation: true,
        lastSeenAt: '2026-06-03T10:00:00Z',
        isStale: false,
        latestLocation: { latitude: 33.89, longitude: 35.5, recordedAt: '2026-06-03T10:00:00Z' },
      },
      destination: { latitude: 33.9, longitude: 35.51, label: 'Gate A' },
    })
    expect(res.delivery?.status).toBe('out_for_delivery')
    expect(res.destinationCoordinatesAvailable).toBe(true)
    expect(res.destinationLabel).toBe('Gate A')
    expect(res.etaAvailable).toBe(true)
    expect(res.etaMinutesMin).toBeGreaterThan(0)
    expect(res.etaMinutesMax).toBeGreaterThanOrEqual(res.etaMinutesMin)
    expect(res.distanceKm).toBeGreaterThan(0)
    expect(res).not.toHaveProperty('unavailableReason')
    expect(res).not.toHaveProperty('confidence')
    expect(res.delivery?.label).toBe('Out for delivery')
    expect(res.driver?.name).toBe('Ali Hassan')
    expect(res.driver?.phone).toBeUndefined()
    expect(res).not.toHaveProperty('routeId')
    expect(res).not.toHaveProperty('assignment')
  })

  it('omits driver name when config disabled', async () => {
    const { config } = await import('../config/env.js')
    config.GPS_RESTAURANT_SHOW_DRIVER_NAME = false
    const res = buildRestaurantTrackingResponse({
      orderId: 'o1',
      assignment: { status: 'assigned', driver_name: 'Hidden' },
      tracking: { enabled: true, hasLocation: false, isStale: false, latestLocation: null },
    })
    expect(res.driver).toBeUndefined()
  })
})
