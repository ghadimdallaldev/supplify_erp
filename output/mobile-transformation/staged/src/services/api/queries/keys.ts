export const queryKeys = {
  me: ['auth', 'me'] as const,
  entitlements: ['entitlements'] as const,
  branches: ['branches'] as const,
  orders: (params?: Record<string, string>) => ['orders', params] as const,
  order: (id: string) => ['orders', id] as const,
  tracking: (id: string) => ['tracking', id] as const,
  products: (params?: Record<string, string>) => ['products', params] as const,
  productCategories: ['products', 'categories'] as const,
  suppliers: (params?: Record<string, string>) => ['suppliers', params] as const,
  supplierPriceComparisons: ['suppliers', 'price-comparison'] as const,
  notifications: ['notifications'] as const,
  notificationPreferences: ['notifications', 'preferences'] as const,
  driverBoard: ['driver', 'board'] as const,
  driverDetail: (id: string) => ['driver', 'detail', id] as const,
  driverRoute: ['driver', 'route'] as const,
  runSheet: (date?: string) => ['supplier', 'run-sheet', date] as const,
  deliveryBoard: (status?: string) => ['supplier', 'deliveries', status] as const,
  dispatch: ['fulfillment', 'dispatch'] as const,
  drivers: ['fulfillment', 'drivers'] as const,
  restaurants: ['restaurants'] as const,
  deliveryLocations: ['restaurant', 'delivery-locations'] as const,
  receivingPending: ['receiving', 'pending'] as const,
  chatConversations: ['chat', 'conversations'] as const,
  chatMessages: (id: string) => ['chat', 'messages', id] as const,
  assistantCapabilities: ['assistant', 'capabilities'] as const,
  quickLists: ['quick-lists'] as const,
  quickList: (id: string) => ['quick-lists', id] as const,
  invoices: (params?: Record<string, string>) => ['finance', 'invoices', params] as const,
  statement: (supplierId: string, start: string, end: string) =>
    ['finance', 'statement', supplierId, start, end] as const,
  receivables: ['finance', 'receivables'] as const,
  inventory: ['restaurant', 'inventory'] as const,
  expirySummary: ['restaurant', 'expiry-summary'] as const,
  deals: ['promotions', 'active'] as const,
  supplierPromotions: (status?: string) => ['promotions', 'supplier', status] as const,
  promotionPricing: ['promotions', 'pricing'] as const,
  promotionAnalytics: (id: string) => ['promotions', 'analytics', id] as const,
  promotionsAnalyticsSummary: (days?: number) => ['promotions', 'analytics-summary', days] as const,
  featuredPackages: ['featured-placement', 'packages'] as const,
  featuredPlacements: ['featured-placement', 'mine'] as const,
  disputes: (params?: Record<string, string>) => ['disputes', params] as const,
  dispute: (id: string) => ['disputes', id] as const,
  quoteRequests: (params?: Record<string, unknown>) => ['quote-requests', params] as const,
  quoteRequest: (id: string) => ['quote-requests', id] as const,
  supplierQuoteInbox: (params?: Record<string, unknown>) =>
    ['supplier-quote-inbox', params] as const,
  supplierQuoteRequest: (id: string) => ['supplier-quote-inbox', id] as const,
  reservationBoard: (date?: string) => ['reservations', 'board', date] as const,
  reservationWaitlist: ['reservations', 'waitlist'] as const,
  staffMembers: ['staff', 'members'] as const,
  myContractPricing: (params?: Record<string, string>) =>
    ['restaurant', 'my-pricing', params] as const,
  contractPricing: (params?: Record<string, string>) =>
    ['supplier', 'contract-pricing', params] as const,
  consumerMenu: (params?: Record<string, string>) => ['consumer', 'menu', params] as const,
  consumerOrders: (params?: Record<string, string>) => ['consumer', 'orders', params] as const,
  consumerLoyaltyProgram: ['consumer', 'loyalty', 'program'] as const,
  recipes: (params?: Record<string, string | number | boolean | undefined>) =>
    ['recipes', params] as const,
  recipeCostingDashboard: ['recipes', 'costing', 'dashboard'] as const,
  recipeAlerts: ['recipes', 'costing', 'alerts'] as const,
  restaurantReport: (path: string, params?: Record<string, string | undefined>) =>
    ['reports', 'restaurant', path, params] as const,
  supplierReport: (path: string, params?: Record<string, string | undefined>) =>
    ['reports', 'supplier', path, params] as const,
  supplierWarehouses: ['supplier', 'warehouses'] as const,
  supplierDrivers: ['supplier', 'drivers'] as const,
  supplierLoyaltyProgram: ['supplier', 'loyalty', 'program'] as const,
  supplierLoyaltyBalances: ['supplier', 'loyalty', 'balances'] as const,
  supplierGrowthMetrics: ['supplier', 'growth', 'metrics'] as const,
  supplierProspects: ['supplier', 'growth', 'prospects'] as const,
  supplierInventory: ['supplier', 'inventory'] as const,
}

export function qs(params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return ''
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  }
  const value = searchParams.toString()
  return value ? `?${value}` : ''
}
