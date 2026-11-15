const DESTINATIONS = {
  get_inventory: '/app/restaurant-inventory',
  get_account_overview: '/app/dashboard',
  get_supplier_overview: '/app/orders',
  get_orders: '/app/orders',
  get_order: '/app/orders',
  get_deliveries: '/app/orders',
  get_invoices: '/app/invoices',
  get_reorder_need: '/app/restaurant-inventory',
  get_reservations: '/app/reservations',
  get_reservation_availability: '/app/reservations',
  search_products: '/app/products',
  compare_supplier_prices: '/app/products',
  get_followed_suppliers: '/app/suppliers',
  get_warehouse_stock: '/app/inventory',
  get_fulfillment_board: '/app/fulfillment',
}

export function withAssistantEvidence(ctx, name, result) {
  const value =
    result && typeof result === 'object' && !Array.isArray(result) ? result : { data: result }
  const lists = Object.entries(value).filter(([, item]) => Array.isArray(item))
  const limited = value.hasMore === true || lists.some(([, items]) => items.length >= 15)
  return {
    ...value,
    evidence: {
      tool: name,
      fetchedAt: new Date().toISOString(),
      status: value.error ? 'unavailable' : 'ok',
      scope: ctx.tenantType,
      scopeId: ctx.tenantId,
      limited,
      totalCount: value.totalCount ?? value.count ?? null,
      returnedCount: lists.length === 1 ? lists[0][1].length : null,
      href: DESTINATIONS[name] || null,
    },
  }
}
