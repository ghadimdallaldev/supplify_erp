import type { CartItem, Product } from '../types'

/** Quick-list line as returned by GET /api/quick-lists (includeItems) and GET /:id. */
export type QuickListItemRow = {
  product_id?: string
  supplier_id?: string
  quantity?: number | string
  notes?: string | null
  default_unit?: string | null
  product_name?: string | null
  product_sku?: string | null
  product_unit?: string | null
  product_price?: number | string | null
  supplier_name?: string | null
  created_at?: string
  updated_at?: string
}

/**
 * Build a cart Product from quick-list item joins.
 * Manual "Order now" must not depend on the add-products catalog query (often skipped/empty).
 */
export function quickListItemToProduct(item: QuickListItemRow): Product | null {
  const productId = String(item.product_id ?? '').trim()
  const supplierId = String(item.supplier_id ?? '').trim()
  if (!productId || !supplierId) return null

  const price =
    item.product_price != null && item.product_price !== '' ? Number(item.product_price) : undefined

  return {
    id: productId,
    supplier_id: supplierId,
    sku: String(item.product_sku ?? ''),
    name: String(item.product_name ?? 'Product'),
    unit: item.product_unit ?? item.default_unit ?? undefined,
    current_price: Number.isFinite(price as number) ? (price as number) : undefined,
    supplier_name: item.supplier_name ?? undefined,
    created_at: item.created_at ?? '',
    updated_at: item.updated_at ?? '',
  }
}

export function cartItemsFromQuickList(
  items: QuickListItemRow[],
  catalogById?: Map<string, Product> | Record<string, Product> | Product[]
): CartItem[] {
  const lookup = (() => {
    if (!catalogById) return null
    if (catalogById instanceof Map) return catalogById
    if (Array.isArray(catalogById)) {
      return new Map(catalogById.filter((p) => p?.id).map((p) => [String(p.id), p] as const))
    }
    return new Map(Object.entries(catalogById))
  })()

  const cartItems: CartItem[] = []
  for (const item of items) {
    const productId = String(item.product_id ?? '').trim()
    const catalogProduct = productId && lookup ? lookup.get(productId) : undefined
    const product = catalogProduct ?? quickListItemToProduct(item)
    if (!product) continue
    const quantity = parseFloat(String(item.quantity ?? 1))
    cartItems.push({
      productId: product.id,
      product,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      ...(item.notes ? { notes: String(item.notes) } : {}),
    })
  }
  return cartItems
}
