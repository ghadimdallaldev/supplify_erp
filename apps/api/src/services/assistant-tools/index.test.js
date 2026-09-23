import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../../lib/feature-flags.js', () => ({
  isFeatureEnabledForTenant: vi.fn(async () => true),
}))

vi.mock('../restaurant-price-intelligence.service.js', () => ({
  getProductPriceHistory: vi.fn(),
  listPriceChangeAlerts: vi.fn(),
}))
vi.mock('../restaurant-waste-intelligence.service.js', () => ({ getWasteIntelligence: vi.fn() }))
vi.mock('../../lib/intelligence-tier.js', () => ({
  getIntelligenceTierForTenant: vi.fn(async () => ({ tier: 'basic' })),
  INTELLIGENCE_TIER_ORDER: ['none', 'basic', 'advanced', 'scale'],
}))

vi.mock('../restaurant-reorder-assistance.service.js', () => ({
  getReorderAssistance: vi.fn(),
}))

vi.mock('../driver-location.service.js', () => ({
  getOrderTracking: vi.fn(),
}))

vi.mock('../restaurant-payables.service.js', () => ({
  getRestaurantPayables: vi.fn(),
}))

vi.mock('../supplier-receivables.service.js', () => ({
  getSupplierReceivables: vi.fn(),
}))

vi.mock('../recipe.service.js', () => ({
  listRecipes: vi.fn(),
}))

vi.mock('../reports.service.js', () => ({
  parseReportQuery: vi.fn(() => ({ from: '2026-01-01', to: '2026-01-31', granularity: 'day' })),
  restaurantWaste: vi.fn(),
  restaurantSpendBySupplier: vi.fn(),
  restaurantOrderVolume: vi.fn(),
  restaurantTopProducts: vi.fn(),
  restaurantInvoiceAging: vi.fn(),
  supplierRevenueTrend: vi.fn(),
  supplierTopRestaurants: vi.fn(),
  supplierFulfillmentPerformance: vi.fn(),
  supplierTopProducts: vi.fn(),
}))

vi.mock('../delivery-routes.service.js', () => ({
  listDeliveryRoutes: vi.fn(),
  getDriverActiveRoute: vi.fn(),
}))

vi.mock('../supplier-stock.service.js', () => ({
  listSupplierStockDisplay: vi.fn(),
}))

vi.mock('../supplier-command-center.service.js', () => ({
  getSupplierCommandCenter: vi.fn(),
}))

vi.mock('../../lib/admin-overview-metrics.js', () => ({
  buildAdminOverviewMetrics: vi.fn(),
}))

vi.mock('../../lib/subscription.js', () => ({
  getTenantSubscription: vi.fn(async () => ({ features: { smart_reorder: true } })),
}))

import { query } from '../../lib/db.js'
import {
  getProductPriceHistory,
  listPriceChangeAlerts,
} from '../restaurant-price-intelligence.service.js'
import { getWasteIntelligence } from '../restaurant-waste-intelligence.service.js'
import { resolveAvailableTools, executeAssistantTool } from './index.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'
import { getIntelligenceTierForTenant } from '../../lib/intelligence-tier.js'

function restaurantCtx(overrides = {}) {
  return {
    tenantId: 'rest-1',
    tenantType: 'RESTAURANT',
    userId: 'user-1',
    permissions: [P.INVENTORY_VIEW, P.ORDERS_VIEW],
    roles: ['Purchaser'],
    isAdmin: false,
    isImpersonating: false,
    driverId: null,
    preferredLocale: 'en',
    ...overrides,
  }
}

describe('assistant tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers inventory tool for restaurant with INVENTORY_VIEW', async () => {
    const { names } = await resolveAvailableTools(restaurantCtx())
    expect(names).toContain('get_inventory')
    expect(names).not.toContain('get_fulfillment_board')
    expect(names).not.toContain('get_admin_overview')
  })

  it('offers and runs price history only with catalog permission and intelligence', async () => {
    getProductPriceHistory.mockResolvedValue({
      productId: 'p1',
      events: [{ id: 'event-1' }],
      summary: { observations: 1 },
    })
    const ctx = restaurantCtx({ permissions: [P.CATALOG_VIEW] })
    expect((await resolveAvailableTools(ctx)).names).toContain('get_price_history')
    const result = await executeAssistantTool(ctx, 'get_price_history', {
      productId: 'p1',
      days: 30,
    })
    expect(getProductPriceHistory).toHaveBeenCalledWith('rest-1', 'p1', { days: 30, limit: 15 })
    expect(result.summary.observations).toBe(1)
  })
  it('runs price changes for advanced intelligence', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'advanced' })
    listPriceChangeAlerts.mockResolvedValue({ alerts: [{ id: 'a1' }] })
    const result = await executeAssistantTool(
      restaurantCtx({ permissions: [P.CATALOG_VIEW] }),
      'get_price_changes',
      { days: 45 }
    )
    expect(listPriceChangeAlerts).toHaveBeenCalledWith('rest-1', {
      days: 45,
      minChangePct: undefined,
      direction: undefined,
    })
    expect(result.alerts).toHaveLength(1)
  })

  it('runs waste intelligence with source and advanced-intelligence gates', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'advanced' })
    getWasteIntelligence.mockResolvedValue({ summary: {}, hotspots: [{ productId: 'p1' }] })

    const result = await executeAssistantTool(
      restaurantCtx({ permissions: [P.INVENTORY_VIEW] }),
      'get_waste_intelligence',
      { days: 90 }
    )

    expect(getWasteIntelligence).toHaveBeenCalledWith('rest-1', { days: 90, limit: 15 })
    expect(result.hotspots).toHaveLength(1)
  })
  it('rejects fulfillment board for restaurant', async () => {
    await expect(
      executeAssistantTool(restaurantCtx(), 'get_fulfillment_board', {})
    ).rejects.toMatchObject({ code: 'TOOL_FORBIDDEN' })
  })

  it('searches restaurant inventory by product name', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          productId: 'p1',
          productName: 'Tomato',
          sku: 'TOM',
          unit: 'kg',
          quantity: 12,
          lowStockThreshold: 5,
          isLowStock: false,
        },
      ],
    })
    const result = await executeAssistantTool(restaurantCtx(), 'get_inventory', {
      search: 'tomato',
    })
    expect(result.items[0]).toMatchObject({ productName: 'Tomato', quantity: 12, unit: 'kg' })
    expect(query).toHaveBeenCalled()
  })

  it('only offers driver stops when driverId is set', async () => {
    const without = await resolveAvailableTools(
      restaurantCtx({
        tenantType: 'SUPPLIER',
        tenantId: 'sup-1',
        permissions: [P.DRIVER_DELIVERIES_VIEW],
        driverId: null,
      })
    )
    expect(without.names).not.toContain('get_my_stops')

    const withDriver = await resolveAvailableTools(
      restaurantCtx({
        tenantType: 'SUPPLIER',
        tenantId: 'sup-1',
        permissions: [P.DRIVER_DELIVERIES_VIEW],
        driverId: 'drv-1',
      })
    )
    expect(withDriver.names).toContain('get_my_stops')
  })
})
