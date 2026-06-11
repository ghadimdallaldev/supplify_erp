import { formatEtaRange } from './deliveryEtaDisplay'
import type { DeliveryRouteStop } from '../types'

export type FulfillmentStopBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

export function formatFulfillmentRouteStatus(status: string): string {
  switch (status) {
    case 'PLANNED':
      return 'Route planned'
    case 'IN_PROGRESS':
      return 'On the way'
    case 'COMPLETED':
      return 'Delivered'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return status.replace(/_/g, ' ')
  }
}

export function formatFulfillmentStopStatus(
  stop: Pick<DeliveryRouteStop, 'status' | 'isNext'>,
  routeStatus: string
): { label: string; variant: FulfillmentStopBadgeVariant } {
  if (stop.status === 'DELIVERED') {
    return { label: 'Delivered', variant: 'secondary' }
  }
  if (stop.status === 'FAILED') {
    return { label: 'Problem', variant: 'destructive' }
  }
  if (stop.status === 'OUT_FOR_DELIVERY') {
    return { label: 'On the way', variant: 'default' }
  }
  if (routeStatus === 'IN_PROGRESS') {
    return { label: 'Ready for dispatch', variant: 'outline' }
  }
  return { label: 'Waiting for preparation', variant: 'outline' }
}

export function getStopEtaLabel(
  stop: Pick<DeliveryRouteStop, 'etaAvailable' | 'etaMinutesMin' | 'etaMinutesMax'>
): string | null {
  if (!stop.etaAvailable) return null
  const range = formatEtaRange(stop.etaMinutesMin, stop.etaMinutesMax)
  return range ? `ETA ${range}` : null
}

export function getFulfillmentStopPrimaryAction(
  stop: Pick<DeliveryRouteStop, 'status'>
): { label: string; status: 'OUT_FOR_DELIVERY' | 'DELIVERED' } | null {
  if (stop.status === 'PLANNED') {
    return { label: 'On the way', status: 'OUT_FOR_DELIVERY' }
  }
  if (stop.status === 'OUT_FOR_DELIVERY') {
    return { label: 'Delivered', status: 'DELIVERED' }
  }
  return null
}
