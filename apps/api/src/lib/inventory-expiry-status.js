/**
 * Pure expiry status calculation for restaurant inventory lots.
 * @param {Date|string|null} expiryDate
 * @param {number} thresholdDays
 * @param {Date} [now]
 * @returns {'safe'|'expiring_soon'|'expired'|null}
 */
export function computeExpiryStatus(expiryDate, thresholdDays = 7, now = new Date()) {
  if (!expiryDate) return null
  const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate)
  if (Number.isNaN(expiry.getTime())) return null

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const expiryDay = new Date(expiry)
  expiryDay.setHours(0, 0, 0, 0)

  const msPerDay = 86400000
  const daysUntil = Math.ceil((expiryDay.getTime() - today.getTime()) / msPerDay)

  if (daysUntil < 0) return 'expired'
  if (daysUntil <= thresholdDays) return 'expiring_soon'
  return 'safe'
}

export function mapLotRow(row, thresholdDays) {
  const status = computeExpiryStatus(row.expiry_date, thresholdDays)
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    productId: row.product_id,
    supplierId: row.supplier_id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    receivingReportId: row.receiving_report_id,
    receivingLineItemId: row.receiving_line_item_id,
    itemName: row.item_name,
    productSku: row.product_sku,
    quantity: parseFloat(row.quantity) || 0,
    unit: row.unit,
    batchLotNumber: row.batch_lot_number,
    receivedDate: row.received_date,
    expiryDate: row.expiry_date,
    storageLocation: row.storage_location,
    notes: row.notes,
    supplierName: row.supplier_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
