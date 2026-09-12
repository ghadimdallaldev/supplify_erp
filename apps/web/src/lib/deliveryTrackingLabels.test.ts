import { beforeAll, describe, it, expect } from 'vitest'
import i18n from 'i18next'
import enFulfillment from '../i18n/locales/en/fulfillment.json'
import {
  getGpsStatusLabel,
  getGpsDisplayStatus,
  getLiveDeliveryStatusLine,
} from './deliveryTrackingLabels'
import type { DeliveryTrackingInfo } from '../types'

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: 'fulfillment', ...options })

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

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['fulfillment'],
    resources: { en: { fulfillment: enFulfillment } },
    interpolation: { escapeValue: false },
  })
})

describe('deliveryTrackingLabels', () => {
  it('returns Live for recent location', () => {
    expect(getGpsDisplayStatus(liveTracking)).toBe('live')
    expect(getGpsStatusLabel(liveTracking)).toContain(t('tracking.gps.liveNow'))
  })

  it('returns GPS stale when stale', () => {
    const stale: DeliveryTrackingInfo = { ...liveTracking, isStale: true }
    expect(getGpsDisplayStatus(stale)).toBe('stale')
    expect(getGpsStatusLabel(stale)).toContain(t('tracking.gps.locationNotUpdating'))
  })

  it('returns No GPS yet when no location', () => {
    const none: DeliveryTrackingInfo = {
      enabled: true,
      hasLocation: false,
      lastSeenAt: null,
      isStale: false,
      latestLocation: null,
    }
    expect(getGpsStatusLabel(none)).toBe(t('tracking.gps.noGpsYet'))
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
    ).toBe(t('tracking.gps.trackingOff'))
  })

  it('returns live delivery status lines for active assignments', () => {
    expect(getLiveDeliveryStatusLine('picked_up')).toBe(t('tracking.gps.pickedUpLive'))
    expect(getLiveDeliveryStatusLine('out_for_delivery')).toBe(t('tracking.gps.onTheWayLive'))
    expect(getLiveDeliveryStatusLine('assigned')).toBeNull()
  })
})
