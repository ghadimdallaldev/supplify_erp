const TERMINAL = new Set(['delivered', 'failed', 'rescheduled'])
const ACTIVE = new Set(['pending', 'assigned', 'picked_up', 'out_for_delivery'])

export function isTerminalDriverDeliveryStatus(status: string): boolean {
  return TERMINAL.has(String(status || '').toLowerCase())
}

export function isActiveDriverDeliveryStatus(status: string): boolean {
  return ACTIVE.has(String(status || 'pending').toLowerCase())
}

export type MobileDriverAction = {
  status: 'out_for_delivery' | 'delivered' | 'failed'
  label: string
  primary?: boolean
}

export function getMobileDriverActions(deliveryStatus: string): MobileDriverAction[] {
  const s = String(deliveryStatus || '').toLowerCase()
  // `assigned` and `picked_up` both still need the departure step. Treating
  // picked_up as already en route made "Delivered" the primary action for a
  // delivery the driver had not started, and left GPS tracking unstarted.
  if (s === 'assigned' || s === 'picked_up') {
    return [
      { status: 'out_for_delivery', label: "I'm on the way", primary: true },
      { status: 'failed', label: 'Problem', primary: false },
    ]
  }
  if (s === 'out_for_delivery') {
    return [
      { status: 'delivered', label: 'Delivered', primary: true },
      { status: 'failed', label: 'Problem', primary: false },
    ]
  }
  // `pending` has no driver assignment yet and `rescheduled` needs re-dispatching,
  // so the API rejects driver status calls for both — offer nothing rather than a
  // button that always errors.
  return []
}

export function getDriverGpsBannerLabel(input: {
  trackableCount: number
  trackingActive: boolean
  permissionDenied: boolean
  gpsError: boolean
}): string | null {
  const { trackableCount, trackingActive, permissionDenied, gpsError } = input
  if (trackableCount === 0) return null
  if (permissionDenied) return 'Location permission needed'
  if (trackingActive) return 'Location active'
  if (gpsError) return 'Location not updating'
  return 'Location permission needed'
}

export function formatDeliveryStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Waiting',
    assigned: 'Ready',
    picked_up: 'Picked up',
    out_for_delivery: 'On the way',
    delivered: 'Delivered',
    failed: 'Problem reported',
    rescheduled: 'Rescheduled',
  }
  return map[String(status || 'pending').toLowerCase()] ?? status
}

export const PROBLEM_REASONS = [
  'Restaurant closed',
  'Wrong address',
  'Customer unavailable',
  'Damaged item',
  'Missing item',
  'Vehicle problem',
  'Other',
] as const
