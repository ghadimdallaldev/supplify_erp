import { describe, it, expect } from 'vitest'
import {
  getGpsStatusLabel,
  getGpsDisplayStatus,
  getLiveDeliveryStatusLine,
} from './deliveryTrackingLabels'
import type { DeliveryTrackingInfo } from '../types'

const liveTracking: DeliveryTrackingInfo = {
  enabled: true,
  hasLocation: true,
  lastSeenAt: '2026-06-03T10:00:00.000Z',
  isStale: false,
  staleAfterSeconds: 300,
  latestLocation: {
    latitude: 33.89,
    longitude: 35.5,
    recordedAt: '2026-06-03T10:00:00.000Z',
  },
  lastUpdatedLabel: '1 minute ago',
}

describe('deliveryTrackingLabels', () => {
  it('returns Live for recent location', () => {
    expect(getGpsDisplayStatus(liveTracking)).toBe('live')
    expect(getGpsStatusLabel(liveTracking)).toContain('Live now')
  })

  it('returns GPS stale when stale', () => {
    const stale: DeliveryTrackingInfo = { ...liveTracking, isStale: true }
    expect(getGpsDisplayStatus(stale)).toBe('stale')
    expect(getGpsStatusLabel(stale)).toContain('Location not updating')
  })

  it('returns No GPS yet when no location', () => {
    const none: DeliveryTrackingInfo = {
      enabled: true,
      hasLocation: false,
      lastSeenAt: null,
      isStale: false,
      latestLocation: null,
    }
    expect(getGpsStatusLabel(none)).toBe('No GPS yet')
  })

  it('returns Tracking off when disabled', () => {
    expect(
      getGpsStatusLabel({
        enabled: false,
        hasLocation: false,
        lastSeenAt: null,
        isStale: false,
        latestLocation: null,
      })
    ).toBe('Tracking off')
  })

  it('returns live delivery status lines for active assignments', () => {
    expect(getLiveDeliveryStatusLine('picked_up')).toBe('Picked up order · Live now')
    expect(getLiveDeliveryStatusLine('out_for_delivery')).toBe('On the way · Live now')
    expect(getLiveDeliveryStatusLine('assigned')).toBeNull()
  })
})
