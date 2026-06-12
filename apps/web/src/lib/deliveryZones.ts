import type { ConsumerFulfillmentBranch } from '../services/consumerApi'

export type DeliveryZone = ConsumerFulfillmentBranch['deliveryZones'][number]

export function normalizePostcode(postcode: string): string {
  return postcode.trim().toUpperCase().replace(/\s+/g, '')
}

export function matchDeliveryZone(zones: DeliveryZone[], postcode: string): DeliveryZone | null {
  if (!zones.length) return null
  const normalized = normalizePostcode(postcode)
  if (!normalized) return null

  const prefixMatch = zones.find((zone) => {
    if (!zone.postcode_prefix) return false
    const prefix = normalizePostcode(zone.postcode_prefix)
    return prefix.length > 0 && normalized.startsWith(prefix)
  })
  if (prefixMatch) return prefixMatch

  const catchAll = zones.find((zone) => !zone.postcode_prefix?.trim())
  return catchAll ?? null
}

export function zoneMinOrder(zone: DeliveryZone | null, branchMin: number): number {
  if (!zone) return branchMin
  return Math.max(branchMin, Number(zone.min_order_amount ?? 0))
}

export function zoneDeliveryFee(zone: DeliveryZone | null, branchFee: number): number {
  if (!zone) return branchFee
  return Number(zone.delivery_fee ?? branchFee)
}
