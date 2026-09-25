import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../../lib/feature-flags.js', () => ({
  isFeatureEnabledForTenant: vi.fn(async () => true),
  getResolvedFeatureValue: vi.fn(async () => 'forecast'),
}))
vi.mock('../../lib/smart-reorder-tier.js', () => ({
  hasSmartReorderCapability: vi.fn(() => true),
}))

vi.mock('../restaurant-price-intelligence.service.js', () => ({
  getProductPriceHistory: vi.fn(),
  listPriceChangeAlerts: vi.fn(),
}))
vi.mock('../restaurant-waste-intelligence.service.js', () => ({ getWasteIntelligence: vi.fn() }))
vi.mock('../restaurant-supplier-reliability.service.js', () => ({
  listSupplierReliability: vi.fn(),
}))
vi.mock('../restaurant-margin-intelligence.service.js', () => ({
  listWeakMarginMenuItems: vi.fn(),
}))
vi.mock('../restaurant-over-ordering-intelligence.service.js', () => ({
  listOverOrderingIntelligence: vi.fn(),
}))
vi.mock('../restaurant-invoice-anomaly-intelligence.service.js', () => ({
  listInvoiceAnomalies: vi.fn(),
}))
vi.mock('../org-reports.service.js', () => ({
  restaurantOrgBranchComparison: vi.fn(),
  restaurantOrgStockTransferSuggestions: vi.fn(),
}))
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
vi.mock('../supplier-slow-moving-intelligence.service.js', () => ({
  listSupplierSlowMovingInventory: vi.fn(),
}))
vi.mock('../supplier-demand-forecast.service.js', () => ({
  listSupplierDemandForecast: vi.fn(),
}))
vi.mock('../supplier-stockout-intelligence.service.js', () => ({
  listSupplierStockoutRisks: vi.fn(),
}))
vi.mock('../supplier-cross-sell-intelligence.service.js', () => ({
  listSupplierCrossSellOpportunities: vi.fn(),
}))
vi.mock('../supplier-suggested-deals-intelligence.service.js', () => ({
  listSupplierSuggestedDealCandidates: vi.fn(),
}))
vi.mock('../supplier-warehouse-performance-intelligence.service.js', () => ({
  listSupplierWarehousePerformance: vi.fn(),
}))
vi.mock('../supplier-warehouse-demand-forecast.service.js', () => ({
  listSupplierWarehouseDemandForecast: vi.fn(),
}))
vi.mock('../supplier-weekly-intelligence-summary.service.js', () => ({
  getSupplierWeeklyIntelligenceSummary: vi.fn(),
}))

vi.mock('../../lib/admin-overview-metrics.js', () => ({
  buildAdminOverviewMetrics: vi.fn(),
}))

vi.mock('../../lib/subscription.js', () => ({
  getTenantSubscription: vi.fn(async () => ({ features: { smart_reorder: true } })),
}))

import { query } from '../../lib/db.js'
import { getResolvedFeatureValue } from '../../lib/feature-flags.js'
import {
  getProductPriceHistory,
  listPriceChangeAlerts,
} from '../restaurant-price-intelligence.service.js'
import { getWasteIntelligence } from '../restaurant-waste-intelligence.service.js'
import { listSupplierReliability } from '../restaurant-supplier-reliability.service.js'
import { listWeakMarginMenuItems } from '../restaurant-margin-intelligence.service.js'
import { listOverOrderingIntelligence } from '../restaurant-over-ordering-intelligence.service.js'
import { listInvoiceAnomalies } from '../restaurant-invoice-anomaly-intelligence.service.js'
import {
  restaurantOrgBranchComparison,
  restaurantOrgStockTransferSuggestions,
} from '../org-reports.service.js'
import { resolveAvailableTools, executeAssistantTool } from './index.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'
import { getIntelligenceTierForTenant } from '../../lib/intelligence-tier.js'
import { listSupplierSlowMovingInventory } from '../supplier-slow-moving-intelligence.service.js'
import { listSupplierDemandForecast } from '../supplier-demand-forecast.service.js'
import { listSupplierStockoutRisks } from '../supplier-stockout-intelligence.service.js'
import { listSupplierCrossSellOpportunities } from '../supplier-cross-sell-intelligence.service.js'
import { listSupplierSuggestedDealCandidates } from '../supplier-suggested-deals-intelligence.service.js'
import { listSupplierWarehousePerformance } from '../supplier-warehouse-performance-intelligence.service.js'
import { listSupplierWarehouseDemandForecast } from '../supplier-warehouse-demand-forecast.service.js'
import { getSupplierWeeklyIntelligenceSummary } from '../supplier-weekly-intelligence-summary.service.js'

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
    query.mockReset()
    query.mockResolvedValue({ rows: [] })
  })

  it('offers inventory tool for restaurant with INVENTORY_VIEW', async () => {
    const { names } = await resolveAvailableTools(restaurantCtx())
    expect(names).toContain('get_inventory')
    expect(names).not.toContain('get_fulfillment_board')
    expect(names).not.toContain('get_admin_overview')
  })

  it('lists the authenticated restaurant followed suppliers from live records', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { supplierId: 'supplier-1', supplierName: 'Fresh One' },
        { supplierId: 'supplier-2', supplierName: 'Fresh Two' },
      ],
    })
    const ctx = restaurantCtx({ permissions: [P.CATALOG_VIEW] })

    expect((await resolveAvailableTools(ctx)).names).toContain('get_followed_suppliers')
    const result = await executeAssistantTool(ctx, 'get_followed_suppliers', {})

    expect(result.count).toBe(2)
    expect(result.suppliers).toHaveLength(2)
    expect(query.mock.calls.at(-1)[1]).toEqual(['rest-1'])
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
  it('runs supplier reliability with source and advanced-intelligence gates', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'advanced' })
    listSupplierReliability.mockResolvedValue({ suppliers: [{ supplierId: 's1' }] })

    const result = await executeAssistantTool(
      restaurantCtx({ permissions: [P.RECEIVING_VIEW] }),
      'get_supplier_reliability',
      { days: 120 }
    )

    expect(listSupplierReliability).toHaveBeenCalledWith('rest-1', { days: 120 })
    expect(result.suppliers).toHaveLength(1)
  })
  it('runs recipe profitability with cost and advanced-intelligence gates', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'advanced' })
    listWeakMarginMenuItems.mockResolvedValue({ items: [{ recipeId: 'r1' }] })

    const result = await executeAssistantTool(
      restaurantCtx({ permissions: [P.RECIPES_VIEW_COSTS] }),
      'get_recipe_profitability',
      { maxMarginPct: 55 }
    )

    expect(listWeakMarginMenuItems).toHaveBeenCalledWith('rest-1', {
      maxMarginPct: 55,
      limit: 15,
    })
    expect(result.items).toHaveLength(1)
  })
  it('runs over-ordering with both source permissions and advanced intelligence', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'advanced' })
    listOverOrderingIntelligence.mockResolvedValue({ summary: {}, products: [{ productId: 'p1' }] })

    const result = await executeAssistantTool(
      restaurantCtx({ permissions: [P.INVENTORY_VIEW, P.RECEIVING_VIEW] }),
      'get_over_ordering',
      { days: 120 }
    )

    expect(listOverOrderingIntelligence).toHaveBeenCalledWith('rest-1', { days: 120, limit: 15 })
    expect(result.products).toHaveLength(1)
  })
  it('runs invoice anomalies with source and advanced-intelligence gates', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'advanced' })
    listInvoiceAnomalies.mockResolvedValue({ summary: {}, invoices: [{ invoiceId: 'i1' }] })

    const result = await executeAssistantTool(
      restaurantCtx({ permissions: [P.INVOICES_VIEW] }),
      'get_invoice_anomalies',
      { days: 120, minChangePct: 8 }
    )

    expect(listInvoiceAnomalies).toHaveBeenCalledWith('rest-1', {
      days: 120,
      minChangePct: 8,
      limit: 15,
    })
    expect(result.invoices).toHaveLength(1)
  })
  it('runs branch comparison with matching org source gates and scale intelligence', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'rest-main' }] })
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    restaurantOrgBranchComparison.mockResolvedValue({
      data: { branches: [{ branchAccountId: 'branch-1' }] },
      meta: {},
    })

    const result = await executeAssistantTool(
      restaurantCtx({ permissions: [P.ORDERS_VIEW, P.INVENTORY_VIEW, P.RECEIVING_VIEW] }),
      'get_branch_comparison',
      { from: '2026-09-01', to: '2026-09-30' }
    )

    expect(restaurantOrgBranchComparison).toHaveBeenCalledWith('user-1', 'org-1', {
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(result.data.branches).toHaveLength(1)
  })
  it('runs transfer suggestions with multi-branch and forecast gates', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'rest-main' }] })
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    restaurantOrgStockTransferSuggestions.mockResolvedValue({
      data: { suggestions: [{ productId: 'p1' }] },
      meta: {},
    })

    const result = await executeAssistantTool(
      restaurantCtx({ permissions: [P.INVENTORY_VIEW] }),
      'get_transfer_suggestions',
      {}
    )

    expect(restaurantOrgStockTransferSuggestions).toHaveBeenCalledWith('user-1', 'org-1')
    expect(result.data.suggestions).toHaveLength(1)
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

  it('lists restaurant inventory when no search term is supplied', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { productId: 'p1', productName: 'Tomato', quantity: 2, isLowStock: true },
        { productId: 'p2', productName: 'Onion', quantity: 40, isLowStock: false },
      ],
    })
    const result = await executeAssistantTool(restaurantCtx(), 'get_inventory', {})
    expect(result.items).toHaveLength(2)
    expect(result.filtered).toBe(false)
    expect(query).toHaveBeenCalledWith(expect.any(String), ['rest-1', '', false, 15])
  })

  it('returns only low stock rows when lowStockOnly is set', async () => {
    query.mockResolvedValueOnce({
      rows: [{ productId: 'p1', productName: 'Tomato', quantity: 2, isLowStock: true }],
    })
    const result = await executeAssistantTool(restaurantCtx(), 'get_inventory', {
      lowStockOnly: true,
    })
    expect(result.items).toHaveLength(1)
    expect(result.filtered).toBe(true)
    expect(query).toHaveBeenCalledWith(expect.any(String), ['rest-1', '', true, 15])
  })

  it('exposes broad lookup tools without requiring a product name', async () => {
    const { names, definitions } = await resolveAvailableTools(restaurantCtx())
    const inventory = definitions.find((d) => d.name === 'get_inventory')
    expect(inventory.parameters.required).toBeUndefined()
    expect(names).toContain('get_account_overview')
  })

  it('builds a whole-account overview for a restaurant', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ trackedProducts: 120, lowStockCount: 7, outOfStockCount: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ordersLast30Days: 18, spendLast30Days: 5400, openOrders: 3 }],
      })
    const result = await executeAssistantTool(restaurantCtx(), 'get_account_overview', {})
    expect(result.inventory).toMatchObject({ trackedProducts: 120, lowStockCount: 7 })
    expect(result.orders).toMatchObject({ ordersLast30Days: 18, openOrders: 3 })
  })

  it('omits order figures from the overview without ORDERS_VIEW', async () => {
    query.mockResolvedValueOnce({
      rows: [{ trackedProducts: 5, lowStockCount: 0, outOfStockCount: 0 }],
    })
    const ctx = restaurantCtx({ permissions: [P.INVENTORY_VIEW], roles: [] })
    const result = await executeAssistantTool(ctx, 'get_account_overview', {})
    expect(result.inventory.trackedProducts).toBe(5)
    expect(result.orders).toBeNull()
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
describe('supplier slow-moving Assistant tool', () => {
  it('uses the supplier-scoped service only with warehouse, inventory, and Scale access', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    listSupplierSlowMovingInventory.mockResolvedValue({
      products: Array.from({ length: 20 }, (_, i) => ({ productId: String(i) })),
    })
    const result = await executeAssistantTool(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.WAREHOUSES_VIEW],
      }),
      'get_supplier_slow_moving_inventory',
      { days: 999 }
    )
    expect(listSupplierSlowMovingInventory).toHaveBeenCalledWith('supplier-1', {
      days: 365,
      limit: 15,
    })
    expect(result.products).toHaveLength(15)
  })
})

describe('supplier demand-forecast Assistant tool', () => {
  it('reuses the forecast service with Supplier Scale and a bounded horizon', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    listSupplierDemandForecast.mockResolvedValue({
      forecasts: Array.from({ length: 20 }, (_, i) => ({ productId: String(i) })),
    })
    const result = await executeAssistantTool(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW],
      }),
      'get_supplier_demand_forecast',
      { horizonDays: 999 }
    )
    expect(listSupplierDemandForecast).toHaveBeenCalledWith('supplier-1', {
      horizonDays: 90,
      limit: 15,
    })
    expect(result.forecasts).toHaveLength(15)
  })

  it('is not discoverable without the source permission or Supplier Scale tier', async () => {
    const withoutPermission = await resolveAvailableTools(
      restaurantCtx({ tenantId: 'supplier-1', tenantType: 'SUPPLIER', permissions: [] })
    )
    expect(withoutPermission.names).not.toContain('get_supplier_demand_forecast')

    const belowScale = await resolveAvailableTools(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW],
      })
    )
    expect(belowScale.names).not.toContain('get_supplier_demand_forecast')
  })
})

describe('supplier stockout-risk Assistant tool', () => {
  it('reuses the stockout service with Supplier Scale and a bounded horizon', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    listSupplierStockoutRisks.mockResolvedValue({
      risks: Array.from({ length: 20 }, (_, i) => ({ productId: String(i) })),
    })
    const result = await executeAssistantTool(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW, P.WAREHOUSES_VIEW],
      }),
      'get_supplier_stockout_risks',
      { horizonDays: 999 }
    )
    expect(listSupplierStockoutRisks).toHaveBeenCalledWith('supplier-1', {
      horizonDays: 90,
      limit: 15,
    })
    expect(result.risks).toHaveLength(15)
  })

  it('is not discoverable without both source permissions, forecast capability, and Supplier Scale', async () => {
    const withoutWarehousePermission = await resolveAvailableTools(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW],
      })
    )
    expect(withoutWarehousePermission.names).not.toContain('get_supplier_stockout_risks')

    getResolvedFeatureValue
      .mockResolvedValueOnce('suggestions_only')
      .mockResolvedValueOnce('suggestions_only')
    const withoutForecastCapability = await resolveAvailableTools(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW, P.WAREHOUSES_VIEW],
      })
    )
    expect(withoutForecastCapability.names).not.toContain('get_supplier_stockout_risks')

    const belowScale = await resolveAvailableTools(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW, P.WAREHOUSES_VIEW],
      })
    )
    expect(belowScale.names).not.toContain('get_supplier_stockout_risks')
  })
})

describe('supplier cross-sell Assistant tool', () => {
  it('reuses the exact-product-pair service with Supplier Scale and bounded days', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    listSupplierCrossSellOpportunities.mockResolvedValue({
      opportunities: Array.from({ length: 20 }, (_, i) => ({ restaurantId: String(i) })),
    })
    const result = await executeAssistantTool(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW],
      }),
      'get_supplier_cross_sell_opportunities',
      { days: 999 }
    )
    expect(listSupplierCrossSellOpportunities).toHaveBeenCalledWith('supplier-1', {
      days: 365,
      limit: 15,
    })
    expect(result.opportunities).toHaveLength(15)
  })

  it('is not discoverable without ORDERS_VIEW or Supplier Scale', async () => {
    const withoutPermission = await resolveAvailableTools(
      restaurantCtx({ tenantId: 'supplier-1', tenantType: 'SUPPLIER', permissions: [] })
    )
    expect(withoutPermission.names).not.toContain('get_supplier_cross_sell_opportunities')
    const belowScale = await resolveAvailableTools(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW],
      })
    )
    expect(belowScale.names).not.toContain('get_supplier_cross_sell_opportunities')
  })
})

describe('supplier suggested-deals Assistant tool', () => {
  it('reads bounded deal-review candidates only with the matching Supplier Scale gates', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    listSupplierSuggestedDealCandidates.mockResolvedValue({
      candidates: Array.from({ length: 20 }, (_, i) => ({ productId: String(i) })),
    })
    const result = await executeAssistantTool(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.WAREHOUSES_VIEW, P.PROMOTIONS_MANAGE],
      }),
      'get_supplier_suggested_deals',
      { days: 999 }
    )
    expect(listSupplierSuggestedDealCandidates).toHaveBeenCalledWith('supplier-1', {
      days: 365,
      limit: 15,
    })
    expect(result.candidates).toHaveLength(15)
  })
})

describe('supplier warehouse-performance Assistant tool', () => {
  it('reads bounded warehouse facts only with matching Supplier Scale gates', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    listSupplierWarehousePerformance.mockResolvedValue({
      warehouses: Array.from({ length: 20 }, (_, i) => ({ warehouseId: String(i) })),
    })
    const result = await executeAssistantTool(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.WAREHOUSES_VIEW, P.FULFILLMENT_VIEW],
      }),
      'get_supplier_warehouse_performance',
      { days: 999 }
    )
    expect(listSupplierWarehousePerformance).toHaveBeenCalledWith('supplier-1', {
      days: 365,
      limit: 15,
    })
    expect(result.warehouses).toHaveLength(15)
  })
})

describe('supplier warehouse-demand-forecast Assistant tool', () => {
  it('reads bounded warehouse forecasts only with matching Supplier Scale gates', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    listSupplierWarehouseDemandForecast.mockResolvedValue({
      forecasts: Array.from({ length: 20 }, (_, i) => ({ warehouseId: String(i) })),
    })
    const result = await executeAssistantTool(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW, P.WAREHOUSES_VIEW],
      }),
      'get_supplier_warehouse_demand_forecast',
      { horizonDays: 999 }
    )
    expect(listSupplierWarehouseDemandForecast).toHaveBeenCalledWith('supplier-1', {
      horizonDays: 90,
      limit: 15,
    })
    expect(result.forecasts).toHaveLength(15)
  })
})

describe('supplier weekly-summary Assistant tool', () => {
  it('reuses bounded composed evidence with every source gate at Supplier Scale', async () => {
    getIntelligenceTierForTenant.mockResolvedValueOnce({ tier: 'scale' })
    getSupplierWeeklyIntelligenceSummary.mockResolvedValue({ summary: {} })
    const result = await executeAssistantTool(
      restaurantCtx({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: [P.ORDERS_VIEW, P.WAREHOUSES_VIEW, P.FULFILLMENT_VIEW],
      }),
      'get_supplier_weekly_intelligence_summary',
      { days: 999 }
    )
    expect(getSupplierWeeklyIntelligenceSummary).toHaveBeenCalledWith('supplier-1', { days: 31 })
    expect(result).toEqual({ summary: {} })
  })
})
