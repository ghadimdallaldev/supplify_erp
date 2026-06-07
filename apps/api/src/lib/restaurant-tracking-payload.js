import { config } from '../config/env.js'
import { buildTrackingPayload } from './delivery-tracking-payload.js'
import { buildDestinationPayload, computeEtaReadiness } from './delivery-coordinates.js'

const DELIVERY_STATUS_LABELS = {
  pending: 'Pending',
  assigned: 'Assigned',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Failed',
  rescheduled: 'Rescheduled',
}

export function formatDeliveryStatusLabel(status) {
  if (!status) return 'Pending'
  const key = String(status).toLowerCase()
  return DELIVERY_STATUS_LABELS[key] ?? key.replace(/_/g, ' ')
}

function formatOrderReference(orderId) {
  if (!orderId) return ''
  const short = String(orderId).slice(0, 8)
  return `ORD-${short}`
}

export function buildRestaurantTrackingDisabledResponse(orderId) {
  return {
    orderId,
    orderReference: formatOrderReference(orderId),
    trackingEnabled: false,
    reason: 'restaurant_tracking_disabled',
    etaAvailable: false,
  }
}

/**
 * Sanitized tracking payload for restaurant tenants — no route context, driver IDs, or history.
 */
export function buildRestaurantTrackingResponse({
  orderId,
  orderStatus,
  assignment,
  tracking,
  destination = null,
}) {
  const deliveryStatus = assignment?.status ?? 'pending'
  const destinationPayload = buildDestinationPayload(destination, { includeCoordinates: false })
  const etaAvailable = computeEtaReadiness(tracking, destination)

  const payload = {
    orderId,
    orderReference: formatOrderReference(orderId),
    orderStatus: orderStatus ?? null,
    trackingEnabled: tracking?.enabled ?? false,
    etaAvailable,
    destinationCoordinatesAvailable: destinationPayload.coordinatesAvailable,
    destinationLabel: destinationPayload.label,
    delivery: assignment
      ? {
          status: deliveryStatus,
          label: formatDeliveryStatusLabel(deliveryStatus),
          assignedAt: assignment.assigned_at ?? null,
          pickedUpAt: assignment.picked_up_at ?? null,
          deliveredAt: assignment.delivered_at ?? null,
        }
      : null,
    tracking,
  }

  if (config.GPS_RESTAURANT_SHOW_DRIVER_NAME && assignment?.driver_name) {
    payload.driver = { name: assignment.driver_name }
  }

  if (config.GPS_RESTAURANT_SHOW_DRIVER_PHONE && assignment?.driver_phone) {
    payload.driver = {
      ...(payload.driver ?? {}),
      phone: assignment.driver_phone,
    }
  }

  return payload
}
