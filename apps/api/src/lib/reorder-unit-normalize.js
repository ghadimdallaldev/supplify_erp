import { normalizeProductUnit, snapQuantityToUnit } from './quantity-unit.js'

/**
 * Units are stored per product; receiving lines may use a different label.
 * Without a conversion table we treat matching normalized units as 1:1.
 * @returns {{ quantity: number, unit: string, converted: boolean, confidencePenalty: number }}
 */
export function normalizeQuantityToProductUnit(quantity, fromUnit, productUnit) {
  const baseUnit = normalizeProductUnit(productUnit || 'unit')
  const sourceUnit = normalizeProductUnit(fromUnit || productUnit || 'unit')
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty < 0) {
    return { quantity: 0, unit: baseUnit, converted: false, confidencePenalty: 0.25 }
  }

  if (sourceUnit === baseUnit) {
    return {
      quantity: snapQuantityToUnit(qty, baseUnit),
      unit: baseUnit,
      converted: false,
      confidencePenalty: 0,
    }
  }

  return {
    quantity: snapQuantityToUnit(qty, baseUnit),
    unit: baseUnit,
    converted: true,
    confidencePenalty: 0.2,
  }
}

/**
 * Round recommended qty up to supplier MOQ and order_multiple (pack size).
 * @param {number} rawQty
 * @param {{ moq?: number | null, orderMultiple?: number | null }} pack
 * @param {string} unit
 */
export function applySupplierPackRounding(rawQty, pack, unit) {
  const moq = Math.max(1, Number(pack.moq) || 1)
  const multiple = Math.max(1, Number(pack.orderMultiple) || 1)
  let qty = Math.max(moq, rawQty)

  if (multiple > 1) {
    qty = Math.ceil(qty / multiple) * multiple
  }

  return snapQuantityToUnit(qty, unit)
}
