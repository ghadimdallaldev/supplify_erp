import type { DeliveryTrackingInfo } from '../types'

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
      return 'Tracking off'
    case 'none':
      return 'No GPS yet'
    case 'stale':
      return tracking?.lastUpdatedLabel ? `GPS stale · ${tracking.lastUpdatedLabel}` : 'GPS stale'
    case 'live':
      return tracking?.lastUpdatedLabel ? `Live · ${tracking.lastUpdatedLabel}` : 'Live'
    default:
      return 'No GPS yet'
  }
}

export function getGpsStatusShort(tracking?: DeliveryTrackingInfo | null): string {
  const status = getGpsDisplayStatus(tracking)
  if (status === 'live') return 'Live'
  if (status === 'stale') return 'Stale'
  if (status === 'off') return 'Off'
  return 'No GPS'
}
