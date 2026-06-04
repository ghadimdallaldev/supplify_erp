/** Map sidebar href → lazy page chunk for hover/focus prefetch. */
const ROUTE_CHUNK_LOADERS: Record<string, () => Promise<unknown>> = {
  '/app/dashboard': () => import('../pages/DashboardPage'),
  '/app/orders': () => import('../pages/OrdersPage'),
  '/app/staff': () => import('../pages/StaffPage'),
  '/app/restaurant-inventory': () => import('../pages/RestaurantInventoryPage'),
  '/app/disputes': () => import('../pages/disputes/DisputesPage'),
  '/app/reports': () => import('../pages/reports/ReportsPage'),
  '/app/products': () => import('../pages/ProductsPage'),
  '/app/reservations': () => import('../pages/ReservationsPage'),
  '/app/receiving': () => import('../pages/ReceivingPage'),
  '/app/promotions': () => import('../pages/promotions/PromotionsPage'),
}

const prefetched = new Set<string>()

export function prefetchRouteChunk(href: string) {
  const loader = ROUTE_CHUNK_LOADERS[href]
  if (!loader || prefetched.has(href)) return
  prefetched.add(href)
  loader().catch(() => {
    prefetched.delete(href)
  })
}
