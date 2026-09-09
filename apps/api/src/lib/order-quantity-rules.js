import { ValidationError } from '../middlewares/errorHandler.js'

/**
 * Assert line quantity satisfies supplier MOQ and pack multiple.
 * Quantities are compared at 3 decimal places (matches NUMERIC(12,3) inventory settings).
 *
 * @param {object} params
 * @param {number} params.quantity
 * @param {number|null|undefined} params.moq
 * @param {number|null|undefined} params.orderMultiple
 * @param {string} [params.sku]
 * @param {string} [params.productId]
 */
export function assertLineQuantityRules({ quantity, moq, orderMultiple, sku, productId }) {
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ValidationError(`Invalid quantity for ${sku || productId || 'product'}`)
  }

  const minQty = Math.max(1, Number(moq) || 1)
  const multiple = Math.max(1, Number(orderMultiple) || 1)
  const label = sku || productId || 'product'
  const scaledQty = Math.round(qty * 1000)
  const scaledMin = Math.round(minQty * 1000)
  const scaledMultiple = Math.round(multiple * 1000)

  if (scaledQty < scaledMin) {
    throw new ValidationError(
      `Quantity for ${label} must be at least ${minQty} (supplier minimum order quantity)`
    )
  }

  if (scaledMultiple > 1000 && scaledQty % scaledMultiple !== 0) {
    throw new ValidationError(`Quantity for ${label} must be ordered in multiples of ${multiple}`)
  }
}

/**
 * Assert supplier cart subtotal meets minimum_order_amount when configured.
 *
 * @param {object} params
 * @param {number} params.subtotal
 * @param {number|null|undefined} params.minimumOrderAmount
 * @param {string} [params.supplierName]
 */
export function assertSupplierMinimumOrderAmount({ subtotal, minimumOrderAmount, supplierName }) {
  if (minimumOrderAmount == null || minimumOrderAmount === '') return
  const minimum = Number(minimumOrderAmount)
  if (!Number.isFinite(minimum) || minimum <= 0) return

  const total = Number(subtotal)
  if (!Number.isFinite(total) || total + 1e-9 < minimum) {
    const who = supplierName || 'this supplier'
    throw new ValidationError(
      `Order total for ${who} must be at least ${minimum.toFixed(2)} (supplier minimum order amount)`
    )
  }
}
