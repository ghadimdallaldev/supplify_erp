import { applySupplierPackRounding } from './reorder-unit-normalize.js'
import { shiftDay } from './reorder-calendar.js'

/** Shared deterministic snapshot used by the panel, assistant, and LLM context. */
export function buildReorderGuidance(item, supply, { asOf, branchId = null } = {}) {
  const warnings = []
  const forecast = item.forecast
  const quality =
    forecast?.signals?.dataQuality ||
    item.dataQuality ||
    (item.avgDailyUsage30 > 0 ? 'fair' : 'poor')
  const stockKnown = Number.isFinite(item.currentQty)
  const needsReview = ['expired', 'near_expiry', 'cadence'].includes(item.reasonCode)
  const coverageDays = forecast?.signals?.coverageDays ?? (item.leadTimeDays ?? 7) + 14
  const expectedUsage =
    forecast?.signals?.projectedDemand ??
    (Number.isFinite(item.avgDailyUsage30) && item.avgDailyUsage30 > 0
      ? item.avgDailyUsage30 * coverageDays
      : null)
  const source = supply.products.get(item.productId)
  const supplyKnown = supply.known && source?.known !== false
  const horizon = asOf ? new Date(`${asOf}T12:00:00Z`) : new Date()
  horizon.setUTCDate(horizon.getUTCDate() + coverageDays)
  const cutoff = horizon.toISOString().slice(0, 10)
  const incomingQty =
    source?.deliveries
      .filter((delivery) => delivery.dependable && delivery.date <= cutoff)
      .reduce((total, delivery) => total + delivery.quantity, 0) || 0
  if (!supplyKnown) warnings.push('incoming_unknown')
  if (source?.overdue > 0) warnings.push('incoming_overdue')
  if (source?.uncertain > 0) warnings.push('incoming_uncertain')
  if (needsReview) warnings.push(item.reasonCode === 'cadence' ? 'cadence_only' : 'review_expiry')
  if (quality === 'poor') warnings.push('limited_history')
  const sharedStock = branchId && item.stockScope !== 'branch'
  if (sharedStock) warnings.push('shared_stock')
  let bridgeNeed = 0
  if (asOf && expectedUsage > 0 && stockKnown) {
    let balance = Math.max(0, item.currentQty)
    const rate = expectedUsage / coverageDays
    for (let day = 0; day < coverageDays; day += 1) {
      const date = shiftDay(asOf, day)
      balance += (source?.deliveries || [])
        .filter((delivery) => delivery.dependable && delivery.date === date)
        .reduce((total, delivery) => total + delivery.quantity, 0)
      balance -= rate
      bridgeNeed = Math.max(bridgeNeed, -balance)
    }
    if (
      bridgeNeed >
      Math.max(0, expectedUsage - Math.max(0, item.currentQty) - incomingQty) + 0.001
    )
      warnings.push('incoming_after_stockout')
  }
  const netNeed =
    stockKnown && expectedUsage != null && supplyKnown && !sharedStock
      ? Number(
          Math.max(
            0,
            expectedUsage - Math.max(0, item.currentQty) - incomingQty,
            bridgeNeed
          ).toFixed(6)
        )
      : null
  const suggestedQty =
    needsReview || sharedStock || !supplyKnown
      ? null
      : netNeed != null
        ? netNeed > 0
          ? applySupplierPackRounding(
              netNeed,
              { moq: item.moq, orderMultiple: item.orderMultiple },
              item.productUnit
            )
          : 0
        : item.suggestedQty
  const action =
    needsReview ||
    sharedStock ||
    !supplyKnown ||
    quality === 'poor' ||
    suggestedQty == null ||
    expectedUsage == null
      ? 'manual_review'
      : suggestedQty === 0
        ? 'wait'
        : 'order'
  return {
    ...item,
    suggestedQty,
    action,
    incomingQty: supplyKnown ? incomingQty : null,
    uncertainIncomingQty: source?.uncertain || 0,
    overdueIncomingQty: source?.overdue || 0,
    expectedUsage,
    netNeed,
    coverageDays,
    dataQuality: quality,
    warnings,
    stockScope: item.stockScope || 'restaurant',
    asOf,
    orderBy: action === 'order' ? (forecast?.reorderByDate ?? null) : null,
  }
}
