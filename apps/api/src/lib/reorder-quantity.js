import { applySupplierPackRounding } from './reorder-unit-normalize.js'

/**
 * Days of safety stock kept on top of supplier lead time when computing the
 * order-up-to level. Kept in sync with COVERAGE_BUFFER_DAYS in
 * reorder-forecast.service.js so heuristic and forecast paths agree.
 */
export const SAFETY_BUFFER_DAYS = 14

/** Fallback lead time used when a product has no supplier setting. */
export const DEFAULT_LEAD_TIME_DAYS = 7

/**
 * Canonical reorder-quantity calculation shared by every heuristic path
 * (unified assistance, legacy reorder-suggestions, inventory list).
 *
 * Uses an order-up-to model: bring stock up to the projected consumption over
 * (lead time + safety buffer), subtract what is already on hand, then round up
 * to the supplier MOQ / pack multiple. Returns `null` when no reorder is
 * warranted (healthy stock and not below the reorder point).
 *
 * @param {object} params
 * @param {number} params.currentQty - Units currently on hand.
 * @param {number} params.avgDailyUsage - Average daily consumption (units/day).
 * @param {number|null|undefined} params.leadTimeDays - Supplier lead time in days.
 * @param {number} [params.lastOrderQty] - Most recent order/restock quantity (fallback).
 * @param {number} [params.moq] - Supplier minimum order quantity.
 * @param {number} [params.orderMultiple] - Supplier pack/order multiple.
 * @param {boolean} [params.belowThreshold] - Whether stock is at/below the reorder point.
 * @param {string} [params.unit] - Product unit, for unit-aware rounding.
 * @returns {number|null}
 */
export function computeSuggestedReorderQty({
  currentQty,
  avgDailyUsage,
  leadTimeDays,
  lastOrderQty = 0,
  moq = 1,
  orderMultiple = 1,
  belowThreshold = false,
  unit = 'unit',
}) {
  const onHand = Math.max(0, Number(currentQty) || 0)
  const usage = Math.max(0, Number(avgDailyUsage) || 0)
  const leadRaw = Number(leadTimeDays)
  const lead = Number.isFinite(leadRaw) && leadRaw > 0 ? leadRaw : DEFAULT_LEAD_TIME_DAYS
  const coverageDays = lead + SAFETY_BUFFER_DAYS

  // Order-up-to level = expected consumption across lead time + safety buffer.
  const target = usage * coverageDays
  let raw = target - onHand

  if (raw <= 0) {
    if (!belowThreshold) {
      // Healthy stock and not below the reorder point — nothing to suggest.
      return null
    }
    // Below the reorder point but usage history is thin: fall back to the
    // most recent order size so the suggestion is still actionable.
    raw = Math.max(Number(lastOrderQty) || 0, 0)
  }

  if (raw <= 0) {
    // No usage and no order history yet — surface at least the MOQ (>= 1).
    raw = Math.max(1, Number(moq) || 1)
  }

  return applySupplierPackRounding(raw, { moq, orderMultiple }, unit)
}
