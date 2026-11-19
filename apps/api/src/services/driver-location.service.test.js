import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    GPS_TRACKING_ENABLED: true,
    GPS_MIN_ACCURACY_METERS: 100,
    GPS_UPDATE_INTERVAL_SECONDS: 15,
    GPS_ALLOW_RESTAURANT_LIVE_TRACKING: true,
    GPS_RESTAURANT_SHOW_DRIVER_NAME: true,
    GPS_RESTAURANT_SHOW_DRIVER_PHONE: false,
    GPS_STALE_AFTER_SECONDS: 300,
  },
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./driver-fulfillment.service.js', () => ({
  getActiveDriverAssignment: vi.fn(),
  assertSupplierOwnsOrder: vi.fn(),
}))

vi.mock('./restaurant-delivery-location.service.js', () => ({
  loadOrderDestination: vi.fn().mockResolvedValue(null),
  loadOrderDestinationForSupplier: vi.fn().mockResolvedValue(null),
}))

import { query } from '../lib/db.js'
import { getActiveDriverAssignment } from './driver-fulfillment.service.js'
import {
  validateCoordinates,
  parseRecordedAt,
  recordDriverLocation,
  isGpsTrackingEnabled,
  getOrderTracking,
} from './driver-location.service.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { assertSupplierOwnsOrder } from './driver-fulfillment.service.js'

describe('driver-location.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockReset()
    query.mockResolvedValue({ rows: [] })
    getActiveDriverAssignment.mockReset()
    assertSupplierOwnsOrder.mockReset()
  })

  it('validateCoordinates rejects out-of-range latitude', () => {
    expect(() => validateCoordinates(95, 35)).toThrow(ValidationError)
  })

  it('validateCoordinates rejects 0,0', () => {
    expect(() => validateCoordinates(0, 0)).toThrow(ValidationError)
  })

  it('parseRecordedAt clamps a phone clock a few minutes ahead to server time', () => {
    const now = new Date('2026-06-03T10:00:00.000Z')
    expect(parseRecordedAt('2026-06-03T10:05:00.000Z', now).toISOString()).toBe(now.toISOString())
  })

  it('parseRecordedAt still rejects timestamps far in the future', () => {
    const now = new Date('2026-06-03T10:00:00.000Z')
    expect(() => parseRecordedAt('2026-06-03T10:30:00.000Z', now)).toThrow(ValidationError)
  })

  it('parseRecordedAt rejects pings older than 24h', () => {
    const now = new Date('2026-06-03T10:00:00.000Z')
    expect(() => parseRecordedAt('2026-06-01T09:00:00.000Z', now)).toThrow(ValidationError)
  })

  it('recordDriverLocation throws NotFound when supplier does not own order', async () => {
    assertSupplierOwnsOrder.mockRejectedValueOnce(new NotFoundError('Order not found'))
    await expect(
      recordDriverLocation({
        supplierId: 's-other',
        orderId: 'o1',
        driverId: 'd1',
        latitude: 33.89,
        longitude: 35.5,
      })
    ).rejects.toThrow(NotFoundError)
  })

  it('rejects GPS for wrong driver on assignment', async () => {
    assertSupplierOwnsOrder.mockResolvedValueOnce({ id: 'o1', status: 'SHIPPED' })
    getActiveDriverAssignment.mockResolvedValueOnce({
      id: 'da-1',
      supplier_id: 's1',
      driver_id: 'd1',
      status: 'out_for_delivery',
    })
    await expect(
      recordDriverLocation({
        supplierId: 's1',
        orderId: 'o1',
        driverId: 'd-other',
        latitude: 33.89,
        longitude: 35.5,
      })
    ).rejects.toThrow(ForbiddenError)
  })

  it('returns disabled when GPS_TRACKING_ENABLED is false', async () => {
    const { config } = await import('../config/env.js')
    config.GPS_TRACKING_ENABLED = false
    const result = await recordDriverLocation({
      supplierId: 's1',
      orderId: 'o1',
      driverId: 'd1',
      latitude: 33.89,
      longitude: 35.5,
    })
    expect(result.trackingEnabled).toBe(false)
    config.GPS_TRACKING_ENABLED = true
  })

  it('ignores (does not error on) a late ping after the stop was delivered', async () => {
    expect(isGpsTrackingEnabled()).toBe(true)
    assertSupplierOwnsOrder.mockResolvedValueOnce({ id: 'o1', status: 'DELIVERED' })
    getActiveDriverAssignment.mockResolvedValueOnce({
      id: 'da-1',
      supplier_id: 's1',
      driver_id: 'd1',
      status: 'delivered',
    })
    await expect(
      recordDriverLocation({
        supplierId: 's1',
        orderId: 'o1',
        driverId: 'd1',
        latitude: 33.89,
        longitude: 35.5,
      })
    ).resolves.toMatchObject({ stored: false, reason: 'delivery_closed' })
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(false)
  })

  it('throttles per (driver, order) from ping history, tolerating the app 14.5s cadence', async () => {
    assertSupplierOwnsOrder.mockResolvedValueOnce({ id: 'o1', status: 'SHIPPED' })
    getActiveDriverAssignment.mockResolvedValueOnce({
      id: 'da-1',
      supplier_id: 's1',
      driver_id: 'd1',
      status: 'out_for_delivery',
    })
    // previous ping for THIS order was 14.5s ago: accepted (old strict 15s check dropped it)
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM driver_location_ping')) {
        return { rows: [{ recorded_at: new Date(Date.now() - 14_500).toISOString() }] }
      }
      return {
        rows: [{ latitude: '33.89', longitude: '35.5', recorded_at: new Date().toISOString() }],
      }
    })
    const result = await recordDriverLocation({
      supplierId: 's1',
      orderId: 'o1',
      driverId: 'd1',
      latitude: 33.89,
      longitude: 35.5,
    })
    expect(result.stored).toBe(true)
    const throttleSql = query.mock.calls
      .map(([sql]) => String(sql))
      .find((q) => q.includes('ORDER BY recorded_at DESC'))
    expect(throttleSql).toContain('driver_location_ping')
    expect(throttleSql).not.toContain('driver_latest_location')
  })

  it('still throttles a ping sent 5s after the previous one for the same order', async () => {
    assertSupplierOwnsOrder.mockResolvedValueOnce({ id: 'o1', status: 'SHIPPED' })
    getActiveDriverAssignment.mockResolvedValueOnce({
      id: 'da-1',
      supplier_id: 's1',
      driver_id: 'd1',
      status: 'out_for_delivery',
    })
    query.mockImplementation(async (sql) =>
      String(sql).includes('FROM driver_location_ping')
        ? { rows: [{ recorded_at: new Date(Date.now() - 5_000).toISOString() }] }
        : { rows: [] }
    )
    const result = await recordDriverLocation({
      supplierId: 's1',
      orderId: 'o1',
      driverId: 'd1',
      latitude: 33.89,
      longitude: 35.5,
    })
    expect(result).toMatchObject({ stored: false, reason: 'rate_limited' })
  })

  it('reads an order-scoped position from that order ping history (not the per-driver row)', async () => {
    const { getLatestLocationRowForOrder } = await import('./driver-location.service.js')
    query.mockResolvedValueOnce({ rows: [{ latitude: '1', longitude: '2' }] })
    await getLatestLocationRowForOrder('o2', 'd1', { orderScopedOnly: true })
    const sql = String(query.mock.calls[0][0])
    expect(sql).toContain('driver_location_ping')
    expect(sql).toContain('ORDER BY recorded_at DESC')
  })

  it('stores ping and upserts latest location for active assignment', async () => {
    assertSupplierOwnsOrder.mockResolvedValueOnce({ id: 'o1', status: 'SHIPPED' })
    getActiveDriverAssignment.mockResolvedValueOnce({
      id: 'da-1',
      supplier_id: 's1',
      driver_id: 'd1',
      status: 'out_for_delivery',
    })
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            latitude: '33.89',
            longitude: '35.5',
            accuracy_meters: '20',
            recorded_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await recordDriverLocation({
      supplierId: 's1',
      orderId: 'o1',
      driverId: 'd1',
      latitude: 33.89,
      longitude: 35.5,
      accuracyMeters: 20,
    })

    expect(result.stored).toBe(true)
    expect(getActiveDriverAssignment).toHaveBeenCalledWith('o1', null, {
      driverId: 'd1',
      assignmentId: null,
    })
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  describe('getOrderTracking — restaurant', () => {
    it('returns disabled payload with reason when restaurant tracking off', async () => {
      const { config } = await import('../config/env.js')
      config.GPS_ALLOW_RESTAURANT_LIVE_TRACKING = false
      query.mockResolvedValueOnce({
        rows: [{ id: 'o1', status: 'SHIPPED', restaurant_id: 'r1' }],
      })

      const result = await getOrderTracking({
        orderId: 'o1',
        restaurantId: 'r1',
      })

      expect(result.trackingEnabled).toBe(false)
      expect(result.reason).toBe('restaurant_tracking_disabled')
      expect(result).not.toHaveProperty('routeId')
      config.GPS_ALLOW_RESTAURANT_LIVE_TRACKING = true
    })

    it('returns sanitized restaurant shape without route context', async () => {
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'o1', status: 'SHIPPED', restaurant_id: 'r1' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'da-1',
              status: 'out_for_delivery',
              driver_id: 'd1',
              driver_name: 'Ali',
              driver_phone: '+123',
              assigned_at: '2026-06-03T09:00:00Z',
              picked_up_at: null,
              delivered_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 'o1',
              latitude: '33.89',
              longitude: '35.5',
              recorded_at: new Date().toISOString(),
            },
          ],
        })

      const result = await getOrderTracking({
        orderId: 'o1',
        restaurantId: 'r1',
      })

      expect(result.delivery?.status).toBe('out_for_delivery')
      expect(result.driver?.name).toBe('Ali')
      expect(result.driver?.phone).toBeUndefined()
      expect(result).not.toHaveProperty('assignment')
      expect(result).not.toHaveProperty('routeNumber')
    })

    it('does not expose location when latest ping is for a different order', async () => {
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'o1', status: 'SHIPPED', restaurant_id: 'r1' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'da-1',
              status: 'out_for_delivery',
              driver_id: 'd1',
              driver_name: 'Ali',
              assigned_at: '2026-06-03T09:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      const result = await getOrderTracking({
        orderId: 'o1',
        restaurantId: 'r1',
      })

      expect(result.tracking?.hasLocation).toBe(false)
    })

    it('sets etaAvailable when destination and driver GPS exist', async () => {
      const { loadOrderDestination } = await import('./restaurant-delivery-location.service.js')
      loadOrderDestination.mockResolvedValueOnce({
        latitude: 33.9,
        longitude: 35.5,
        label: 'Main gate',
      })

      query
        .mockResolvedValueOnce({
          rows: [{ id: 'o1', status: 'SHIPPED', restaurant_id: 'r1' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'da-1',
              status: 'out_for_delivery',
              driver_id: 'd1',
              driver_name: 'Ali',
              assigned_at: '2026-06-03T09:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 'o1',
              latitude: '33.89',
              longitude: '35.5',
              recorded_at: new Date().toISOString(),
            },
          ],
        })

      const result = await getOrderTracking({
        orderId: 'o1',
        restaurantId: 'r1',
      })

      expect(result.destinationCoordinatesAvailable).toBe(true)
      expect(result.destinationLabel).toBe('Main gate')
      expect(result.etaAvailable).toBe(true)
      expect(result.etaMinutesMin).toBeGreaterThan(0)
      expect(result.etaMinutesMax).toBeGreaterThanOrEqual(result.etaMinutesMin)
      expect(result.distanceKm).toBeGreaterThan(0)
      expect(result).not.toHaveProperty('unavailableReason')
    })

    it('marks ETA unavailable when destination coordinates missing', async () => {
      const { loadOrderDestination } = await import('./restaurant-delivery-location.service.js')
      loadOrderDestination.mockResolvedValueOnce(null)

      query
        .mockResolvedValueOnce({
          rows: [{ id: 'o1', status: 'SHIPPED', restaurant_id: 'r1' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'da-1',
              status: 'out_for_delivery',
              driver_id: 'd1',
              driver_name: 'Ali',
              assigned_at: '2026-06-03T09:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 'o1',
              latitude: '33.89',
              longitude: '35.5',
              recorded_at: new Date().toISOString(),
            },
          ],
        })

      const result = await getOrderTracking({
        orderId: 'o1',
        restaurantId: 'r1',
      })

      expect(result.destinationCoordinatesAvailable).toBe(false)
      expect(result.etaAvailable).toBe(false)
    })
  })

  describe('getOrderTracking — supplier', () => {
    it('throws NotFound when supplier does not own order', async () => {
      assertSupplierOwnsOrder.mockRejectedValueOnce(new NotFoundError('Order not found'))
      await expect(getOrderTracking({ orderId: 'o1', supplierId: 's-other' })).rejects.toThrow(
        NotFoundError
      )
    })
  })
})
