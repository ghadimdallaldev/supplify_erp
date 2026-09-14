import { ValidationError } from '../middlewares/errorHandler.js'

/**
 * Require payload to include every order line exactly once; enrich with server-side quantities.
 *
 * @param {Array<{ id: string, quantity: number|string, product_id?: string, unit?: string }>} orderItems
 * @param {Array<{ orderItemId?: string, order_item_id?: string, [key: string]: unknown }>} lineItems
 * @returns {Array<object>} enriched line items with authoritative ordered_quantity
 */
export function validateAndEnrichReceivingLines(orderItems, lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ValidationError('Receiving report must include line items for every order line')
  }

  const orderItemById = new Map((orderItems || []).map((row) => [String(row.id), row]))

  if (orderItemById.size === 0) {
    throw new ValidationError('Order has no line items')
  }

  const seen = new Set()
  const enriched = []

  for (const line of lineItems) {
    const orderItemId = String(line.orderItemId ?? line.order_item_id ?? '')
    if (!orderItemId) {
      throw new ValidationError('Each receiving line must include orderItemId')
    }

    if (seen.has(orderItemId)) {
      throw new ValidationError(`Duplicate receiving line for order item ${orderItemId}`)
    }
    seen.add(orderItemId)

    const orderItem = orderItemById.get(orderItemId)
    if (!orderItem) {
      throw new ValidationError(`Unknown order item ${orderItemId}`)
    }

    const receivedQuantity = line.received_quantity ?? line.receivedQuantity ?? orderItem.quantity
    const qualityStatus = String(
      line.quality_status ?? line.qualityStatus ?? 'ACCEPTED'
    ).toUpperCase()
    const allowedQualityStatuses = new Set([
      'ACCEPTED',
      'DAMAGED',
      'EXPIRED',
      'WRONG_ITEM',
      'SHORT',
    ])
    if (!allowedQualityStatuses.has(qualityStatus)) {
      throw new ValidationError(`Invalid quality status for order item ${orderItemId}`)
    }

    enriched.push({
      ...line,
      orderItemId,
      productId: line.productId ?? line.product_id ?? orderItem.product_id,
      product_name:
        orderItem.product_name ?? line.product_name ?? line.productName ?? 'Unknown product',
      sku: orderItem.sku ?? line.sku ?? 'N/A',
      ordered_quantity: parseFloat(orderItem.quantity),
      received_quantity: receivedQuantity,
      unit: line.unit || orderItem.unit || 'unit',
      expected_unit_price:
        line.expected_unit_price ?? line.expectedUnitPrice ?? orderItem.unit_price,
      actual_unit_price: line.actual_unit_price ?? line.actualUnitPrice ?? orderItem.unit_price,
      quality_status: qualityStatus,
      notes: line.notes ?? '',
      expiryDate: line.expiryDate ?? line.expiry_date,
      batchLotNumber: line.batchLotNumber ?? line.batch_lot_number,
      storageLocation: line.storageLocation ?? line.storage_location,
    })
  }

  const missing = [...orderItemById.keys()].filter((id) => !seen.has(id))
  if (missing.length > 0) {
    throw new ValidationError(
      `Receiving report is missing ${missing.length} order line(s); all lines must be included`
    )
  }

  return enriched
}

/**
 * Compute billable accepted quantity (ACCEPTED quality with received qty > 0).
 */
export function sumBillableAcceptedQuantity(lineItems) {
  return (lineItems || []).reduce((sum, item) => {
    const received = parseFloat(item.received_quantity || 0)
    if (item.quality_status === 'ACCEPTED' && received > 0) {
      return sum + received
    }
    return sum
  }, 0)
}

export function buildReceivingDiscrepancies(lineItems) {
  return (lineItems || [])
    .map((item) => {
      const ordered = Number(item.ordered_quantity || 0)
      const received = Number(item.received_quantity || 0)
      const qualityStatus = String(item.quality_status || 'ACCEPTED').toUpperCase()
      const missing = Math.max(ordered - received, 0)
      const rejected = qualityStatus === 'ACCEPTED' ? 0 : received
      const disputedQuantity = missing + rejected
      if (disputedQuantity <= 0) return null
      const reasons = []
      if (missing > 0) reasons.push(`short by ${missing} ${item.unit || 'unit'}`)
      if (rejected > 0) reasons.push(`${received} marked ${qualityStatus.toLowerCase()}`)
      const unitPrice = Number(item.actual_unit_price || item.expected_unit_price || 0)
      return {
        orderItemId: item.orderItemId,
        productName: item.product_name,
        quantityOrdered: ordered,
        quantityReceived: received,
        unitPrice,
        disputedAmount: disputedQuantity * unitPrice,
        issueDescription: reasons.join('; '),
        qualityStatus,
      }
    })
    .filter(Boolean)
}
