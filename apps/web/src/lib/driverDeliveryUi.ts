import { getAvailableDriverDeliveryStatuses } from './driverDeliveryActions'

export type DriverStatusTone = 'neutral' | 'active' | 'success' | 'warning' | 'danger'

const ACTIVE_STATUSES = new Set(['pending', 'assigned', 'picked_up', 'out_for_delivery'])
const DONE_STATUSES = new Set(['delivered'])
const TERMINAL_STATUSES = new Set(['delivered', 'failed', 'rescheduled'])

export function getDriverStatusTone(status: string): DriverStatusTone {
  const s = String(status || 'pending').toLowerCase()
  if (s === 'out_for_delivery' || s === 'picked_up') return 'active'
  if (s === 'delivered') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'rescheduled') return 'warning'
  return 'neutral'
}

export function driverStatusBadgeClass(tone: DriverStatusTone): string {
  switch (tone) {
    case 'active':
      return 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100'
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
    default:
      return 'border-[var(--app-border)] bg-[var(--brand-ultra)] text-[var(--text-mid)]'
  }
}

export function isActiveDriverDeliveryStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(String(status || 'pending').toLowerCase())
}

export function isDoneDriverDeliveryStatus(status: string): boolean {
  return DONE_STATUSES.has(String(status || '').toLowerCase())
}

export function isTerminalDriverDeliveryStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(String(status || '').toLowerCase())
}

export type DriverAction = {
  value: 'out_for_delivery' | 'delivered' | 'failed' | 'rescheduled'
  label: string
  variant: 'primary' | 'success' | 'outline' | 'danger'
}

const ACTION_META: Record<DriverAction['value'], Omit<DriverAction, 'value'>> = {
  out_for_delivery: { label: "I'm on the way", variant: 'primary' },
  delivered: { label: 'Delivered', variant: 'success' },
  failed: { label: 'Problem', variant: 'danger' },
  rescheduled: { label: 'Reschedule', variant: 'outline' },
}

/** Driver GPS banner for the deliveries header (plain language). */
export function getDriverGpsBannerLabel(input: {
  trackableCount: number
  trackingActive: boolean
  permissionDenied: boolean
  gpsError?: string | null
}): string | null {
  const { trackableCount, trackingActive, permissionDenied, gpsError } = input
  if (trackableCount === 0) return null
  if (permissionDenied) return 'Location permission needed'
  if (trackingActive) return 'Location active'
  if (gpsError) return 'Location not updating'
  return 'Location permission needed'
}

export function getDriverActionsForStatus(deliveryStatus: string): DriverAction[] {
  return getAvailableDriverDeliveryStatuses(deliveryStatus).map((value) => ({
    value,
    ...ACTION_META[value],
  }))
}

export function routeStopIsComplete(status: string): boolean {
  return ['DELIVERED', 'FAILED'].includes(String(status || '').toUpperCase())
}
