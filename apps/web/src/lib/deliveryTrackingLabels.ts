import i18n from 'i18next'
import type { DeliveryTrackingInfo } from '../types'

const NS = 'fulfillment'

function ft(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ns: NS, ...options })
}

export type GpsDisplayStatus = 'off' | 'none' | 'live' | 'stale'

export function getGpsDisplayStatus(tracking?: DeliveryTrackingInfo | null): GpsDisplayStatus {
  if (!tracking?.enabled) return 'off'
  if (!tracking.hasLocation) return 'none'
  if (tracking.isStale) return 'stale'
  return 'live'
}

export function getGpsStatusLabel(tracking?: DeliveryTrackingInfo | null): string {
  const status = getGpsDisplayStatus(tracking)
  switch (status) {
    case 'off':
      return ft('tracking.gps.trackingOff')
    case 'none':
      return ft('tracking.gps.noGpsYet')
    case 'stale':
      return tracking?.lastUpdatedLabel
        ? ft('tracking.gps.locationNotUpdatingWithTime', { time: tracking.lastUpdatedLabel })
        : ft('tracking.gps.locationNotUpdating')
    case 'live':
      return tracking?.lastUpdatedLabel
        ? ft('tracking.gps.liveNowWithTime', { time: tracking.lastUpdatedLabel })
        : ft('tracking.gps.liveNow')
    default:
      return ft('tracking.gps.noGpsYet')
  }
}

export function getGpsStatusShort(tracking?: DeliveryTrackingInfo | null): string {
  const status = getGpsDisplayStatus(tracking)
  if (status === 'live') return ft('tracking.gps.live')
  if (status === 'stale') return ft('tracking.gps.stale')
  if (status === 'off') return ft('tracking.gps.off')
  return ft('tracking.gps.noGps')
}

/** Human-friendly live status for active deliveries (modal / map footer). */
export function getLiveDeliveryStatusLine(status: string | null | undefined): string | null {
  const normalized = String(status || '')
    .toLowerCase()
    .trim()
  if (normalized === 'picked_up') return ft('tracking.gps.pickedUpLive')
  if (normalized === 'out_for_delivery') return ft('tracking.gps.onTheWayLive')
  return null
}
