/**
 * What a restaurant knows about a product's stock (spec §10 Q2): followers get the
 * quantity; everyone else gets only the `in_stock` flag.
 */
export function restaurantStock(product: {
  available_qty?: number | string | null
  in_stock?: boolean | null
}): { qty: number | null; inStock: boolean | null } {
  const raw = product.available_qty
  const qty = raw == null || raw === '' ? NaN : Number(raw)
  if (Number.isFinite(qty)) return { qty, inStock: qty > 0 }
  return { qty: null, inStock: typeof product.in_stock === 'boolean' ? product.in_stock : null }
}
