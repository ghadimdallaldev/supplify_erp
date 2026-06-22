import i18n from 'i18next'
import type { OrderTrackingResponse } from '../../types'
import { isRestaurantOrderTracking } from '../../types'
import {
  getEtaUnavailableMessage,
  getRestaurantEtaPrimaryText,
  getRestaurantEtaSecondaryText,
  getSupplierEtaPrimaryText,
  getSupplierEtaSecondaryText,
  isDestinationMissingEtaUnavailable,
  shouldShowEtaConfidence,
} from '../../lib/deliveryEtaDisplay'
import { DeliveryEtaCard } from './DeliveryEtaCard'

const NS = 'fulfillment'

function ft(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ns: NS, ...options })
}

type Audience = 'restaurant' | 'supplier'

export function getDestinationLabelText(
  data: OrderTrackingResponse | undefined,
  audience: Audience
): string | null {
  const label = data?.destinationLabel?.trim()
  if (!label) return null
  return audience === 'supplier'
    ? ft('tracking.eta.deliveringTo', { label })
    : ft('tracking.eta.destination', { label })
}

type EtaSectionProps = {
  data: OrderTrackingResponse | undefined
  audience: Audience
  testId?: string
  /** When false, skip rendering (e.g. delivered orders). */
  show?: boolean
}

export function DeliveryTrackingEtaSection({
  data,
  audience,
  testId = 'delivery-tracking-eta',
  show = true,
}: EtaSectionProps) {
  if (!show || !data?.trackingEnabled) return null

  let primary: string | null = null
  let secondary: string | null = null
  let showLowConfidence = false

  if (audience === 'restaurant') {
    if (!isRestaurantOrderTracking(data)) return null
    primary = getRestaurantEtaPrimaryText(data)
    secondary = getRestaurantEtaSecondaryText(data)
  } else {
    if (isRestaurantOrderTracking(data)) return null
    primary = getSupplierEtaPrimaryText(data)
    secondary = getSupplierEtaSecondaryText(data)
    showLowConfidence = shouldShowEtaConfidence(data)
  }

  const unavailableMessage = primary ? null : getEtaUnavailableMessage(data)
  const unavailableIsDestinationMissing = isDestinationMissingEtaUnavailable(data)

  if (!primary && !unavailableMessage) return null

  return (
    <DeliveryEtaCard
      primary={primary ?? ''}
      secondary={secondary}
      unavailableMessage={unavailableMessage}
      unavailableIsDestinationMissing={unavailableIsDestinationMissing}
      showLowConfidence={showLowConfidence}
      testId={testId}
    />
  )
}
