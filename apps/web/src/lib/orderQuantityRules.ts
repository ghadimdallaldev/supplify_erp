/**
 * Client-side mirror of apps/api/src/lib/order-quantity-rules.js
 * Server remains the enforcement authority; this improves cart UX before submit.
 */

export type QuantityRuleProduct = {
  id: string
  sku?: string
  name?: string
  moq?: number | null
  order_multiple?: number | null
  orderMultiple?: number | null
  supplier_id?: string
  supplier_name?: string
  supplier_minimum_order_amount?: number | null
  minimumOrderAmount?: number | null
  current_price?: number | null
}

export function getProductMoq(product: QuantityRuleProduct): number {
  return Math.max(1, Number(product.moq) || 1)
}

export function getProductOrderMultiple(product: QuantityRuleProduct): number {
  return Math.max(1, Number(product.order_multiple ?? product.orderMultiple) || 1)
}

export function normalizeCartQuantity(quantity: number, product: QuantityRuleProduct): number {
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  const moq = getProductMoq(product)
  const multiple = getProductOrderMultiple(product)
  let next = Math.max(moq, qty)
  if (multiple > 1) {
    next = Math.ceil(next / multiple) * multiple
  }
  return next
}

export function stepCartQuantity(
  current: number,
  direction: 1 | -1,
  product: QuantityRuleProduct
): number {
  const multiple = getProductOrderMultiple(product)
  const moq = getProductMoq(product)
  const next = Number(current) + direction * multiple
  if (next < moq) return 0
  return next
}

export function validateLineQuantity(
  quantity: number,
  product: QuantityRuleProduct
): string | null {
  const qty = Number(quantity)
  const label = product.sku || product.name || product.id
  if (!Number.isFinite(qty) || qty <= 0) {
    return `Invalid quantity for ${label}`
  }
  const moq = getProductMoq(product)
  const multiple = getProductOrderMultiple(product)
  const scaledQty = Math.round(qty * 1000)
  const scaledMin = Math.round(moq * 1000)
  const scaledMultiple = Math.round(multiple * 1000)
  if (scaledQty < scaledMin) {
    return `Quantity for ${label} must be at least ${moq} (supplier minimum order quantity)`
  }
  if (scaledMultiple > 1000 && scaledQty % scaledMultiple !== 0) {
    return `Quantity for ${label} must be ordered in multiples of ${multiple}`
  }
  return null
}

export function validateSupplierMinimum(
  subtotal: number,
  minimumOrderAmount: number | null | undefined,
  supplierName?: string
): string | null {
  if (minimumOrderAmount == null || minimumOrderAmount === ('' as unknown as number)) return null
  const minimum = Number(minimumOrderAmount)
  if (!Number.isFinite(minimum) || minimum <= 0) return null
  const total = Number(subtotal)
  if (!Number.isFinite(total) || total + 1e-9 < minimum) {
    const who = supplierName || 'this supplier'
    return `Order total for ${who} must be at least ${minimum.toFixed(2)} (supplier minimum order amount)`
  }
  return null
}

export function validateCartItems(
  items: Array<{ product: QuantityRuleProduct; quantity: number }>
): string[] {
  const errors: string[] = []
  for (const item of items) {
    const lineError = validateLineQuantity(item.quantity, item.product)
    if (lineError) errors.push(lineError)
  }

  const bySupplier = new Map<string, { name?: string; subtotal: number; minimum?: number | null }>()
  for (const item of items) {
    const supplierId = item.product.supplier_id || 'unknown'
    const unit = Number(item.product.current_price) || 0
    const existing = bySupplier.get(supplierId) ?? {
      name: item.product.supplier_name,
      subtotal: 0,
      minimum:
        item.product.supplier_minimum_order_amount ?? item.product.minimumOrderAmount ?? null,
    }
    existing.subtotal += unit * Number(item.quantity)
    if (existing.minimum == null) {
      existing.minimum =
        item.product.supplier_minimum_order_amount ?? item.product.minimumOrderAmount ?? null
    }
    bySupplier.set(supplierId, existing)
  }

  for (const group of bySupplier.values()) {
    const minError = validateSupplierMinimum(group.subtotal, group.minimum, group.name)
    if (minError) errors.push(minError)
  }

  return errors
}
