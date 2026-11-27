/**
 * What a restaurant may see of a supplier's stock (spec §10 Q2).
 *
 * Every restaurant that can see a catalog gets an `in_stock` flag. Only followers get the
 * quantity: for non-followers `available_qty` (and the other inventory counters) is removed.
 * Rows must already carry the authoritative `available_qty` and an `is_followed` boolean.
 */
const QTY_FIELDS = ['available_qty', 'total_available', 'reserved_qty', 'on_order_qty']

export function applyRestaurantStockView(row) {
  if (!row) return row
  const out = { ...row }
  out.is_followed = out.is_followed === true
  out.in_stock = Number(out.available_qty || 0) > 0
  if (!out.is_followed) {
    for (const field of QTY_FIELDS) delete out[field]
  }
  return out
}

export function applyRestaurantStockViewToRows(rows) {
  return (rows || []).map(applyRestaurantStockView)
}
