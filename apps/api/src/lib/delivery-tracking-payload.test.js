import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildTrackingPayload,
  getGpsStaleAfterSeconds,
  resolveLocationForOrder,
} from './delivery-tracking-payload.js'

vi.mock('../config/env.js', () => ({
  config: {
    GPS_TRACKING_ENABLED: true,
    GPS_STALE_AFTER_SECONDS: 300,
  },
}))

describe('delivery-tracking-payload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns disabled payload when GPS off', () => {
    const payload = buildTrackingPayload({ enabled: false })
    expect(payload.enabled).toBe(false)
    expect(payload.hasLocation).toBe(false)
  })

  it('marks location as live when recent', () => {
    const payload = buildTrackingPayload({
      latestLocation: {
        latitude: 33.89,
        longitude: 35.5,
        recordedAt: '2026-06-03T09:59:00.000Z',
      },
      staleAfterSeconds: 300,
    })
    expect(payload.hasLocation).toBe(true)
    expect(payload.isStale).toBe(false)
    expect(payload.lastSeenAt).toBe('2026-06-03T09:59:00.000Z')
  })

  it('marks location as stale when older than threshold', () => {
    const payload = buildTrackingPayload({
      latestLocation: {
        latitude: 33.89,
        longitude: 35.5,
        recordedAt: '2026-06-03T09:00:00.000Z',
      },
      staleAfterSeconds: 300,
    })
    expect(payload.isStale).toBe(true)
  })

  it('hasLocation false when no coordinates', () => {
    const payload = buildTrackingPayload({ latestLocation: null })
    expect(payload.hasLocation).toBe(false)
    expect(payload.latestLocation).toBeNull()
  })

  it('reads stale seconds from config', () => {
    expect(getGpsStaleAfterSeconds()).toBe(300)
  })

  it('resolveLocationForOrder returns null when order mismatch and fallback off', () => {
    const loc = resolveLocationForOrder(
      {
        orderId: 'order-b',
        latitude: 33.89,
        longitude: 35.5,
        recordedAt: '2026-06-03T09:59:00.000Z',
      },
      'order-a',
      { allowDriverFallback: false }
    )
    expect(loc).toBeNull()
  })

  it('resolveLocationForOrder allows supplier fallback for other order ping', () => {
    const loc = resolveLocationForOrder(
      {
        orderId: 'order-b',
        latitude: 33.89,
        longitude: 35.5,
        recordedAt: '2026-06-03T09:59:00.000Z',
      },
      'order-a',
      { allowDriverFallback: true }
    )
    expect(loc?.latitude).toBe(33.89)
  })
})
