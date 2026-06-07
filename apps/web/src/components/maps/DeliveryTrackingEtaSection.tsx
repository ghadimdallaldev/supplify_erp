import type { OrderTrackingResponse } from '../../types'
import { isRestaurantOrderTracking } from '../../types'
import {
  getEtaUnavailableMessage,
  getRestaurantEtaPrimaryText,
  getRestaurantEtaSecondaryText,
  getSupplierEtaPrimaryText,
  getSupplierEtaSecondaryText,
  shouldShowEtaConfidence,
} from '../../lib/deliveryEtaDisplay'
import { DeliveryEtaCard } from './DeliveryEtaCard'

type Audience = 'restaurant' | 'supplier'

export function getDestinationLabelText(
  data: OrderTrackingResponse | undefined,
  audience: Audience
): string | null {
  const label = data?.destinationLabel?.trim()
  if (!label) return null
  return audience === 'supplier' ? `Delivering to: ${label}` : `Destination: ${label}`
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

  if (!primary && !unavailableMessage) return null

  return (
    <DeliveryEtaCard
      primary={primary ?? ''}
      secondary={secondary}
      unavailableMessage={unavailableMessage}
      showLowConfidence={showLowConfidence}
      testId={testId}
    />
  )
}
