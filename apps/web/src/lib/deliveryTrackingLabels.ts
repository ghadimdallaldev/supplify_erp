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

/** Human-friendly live status for active deliveries (modal / map footer). */
export function getLiveDeliveryStatusLine(status: string | null | undefined): string | null {
  const normalized = String(status || '')
    .toLowerCase()
    .trim()
  if (normalized === 'picked_up') return 'Picked up · Live now'
  if (normalized === 'out_for_delivery') return 'On the way · Live now'
  return null
}
