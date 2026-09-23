/**
 * Entitlement and scoping guards on the restaurant intelligence endpoints.
 */
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetProductPriceHistory = vi.fn()
const mockListPriceChangeAlerts = vi.fn()
const mockListCheaperBuyOptions = vi.fn()
const mockGetIntelligenceTierForTenant = vi.fn()
const mockGetRestaurantIdForRequest = vi.fn()
const mockListFoodCostWarnings = vi.fn()
const mockListWeakMarginMenuItems = vi.fn()
const mockGetWasteIntelligence = vi.fn()
const mockListSupplierReliability = vi.fn()
const mockListOverOrderingIntelligence = vi.fn()

/** Permission middleware records what it was asked to enforce. */
const requiredPermissions = []
/** Permissions the simulated caller holds; the mock actually enforces them. */
let grantedPermissions = new Set(['CATALOG_VIEW', 'RECIPES_VIEW_COSTS'])

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, _res, next) => {
    req.requestId = 'test-req'
    req.tenantContext = { tenantId: 'restaurant-1', tenantType: 'RESTAURANT' }
    next()
  },
  resolveTenantContext: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  requirePermission: (permission) => {
    requiredPermissions.push(permission)
    return (_req, res, next) => {
      if (grantedPermissions.has(permission)) return next()
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: `Missing ${permission}` },
      })
    }
  },
  getRestaurantIdForRequest: (...args) => mockGetRestaurantIdForRequest(...args),
}))

// Mock the guard itself, not getIntelligenceTierForTenant: the real
// requireIntelligenceTier closes over the module-internal binding, so replacing
// the exported resolver would not affect it. The guard's own tier comparison is
// covered by intelligence-tier.test.js; here we assert the route's layering.
vi.mock('../lib/intelligence-tier.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getIntelligenceTierForTenant: (...args) => mockGetIntelligenceTierForTenant(...args),
    requireIntelligenceTier: (minTier) => async (req, _res, next) => {
      const { tier } = await mockGetIntelligenceTierForTenant(
        req.tenantContext?.tenantId,
        req.tenantContext?.tenantType
      )
      const rank = (t) => actual.INTELLIGENCE_TIER_ORDER.indexOf(t)
      if (rank(tier) < rank(minTier)) {
        const { ForbiddenError } = await import('../middlewares/errorHandler.js')
        return next(new ForbiddenError(`requires ${minTier}`))
      }
      return next()
    },
  }
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
}))

vi.mock('../services/restaurant-price-intelligence.service.js', () => ({
  getProductPriceHistory: (...args) => mockGetProductPriceHistory(...args),
  listPriceChangeAlerts: (...args) => mockListPriceChangeAlerts(...args),
  listCheaperBuyOptions: (...args) => mockListCheaperBuyOptions(...args),
}))

vi.mock('../services/restaurant-margin-intelligence.service.js', () => ({
  listFoodCostWarnings: (...args) => mockListFoodCostWarnings(...args),
  listWeakMarginMenuItems: (...args) => mockListWeakMarginMenuItems(...args),
}))

vi.mock('../services/restaurant-waste-intelligence.service.js', () => ({
  getWasteIntelligence: (...args) => mockGetWasteIntelligence(...args),
}))

vi.mock('../services/restaurant-supplier-reliability.service.js', () => ({
  listSupplierReliability: (...args) => mockListSupplierReliability(...args),
}))

vi.mock('../services/restaurant-over-ordering-intelligence.service.js', () => ({
  listOverOrderingIntelligence: (...args) => mockListOverOrderingIntelligence(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { restaurantIntelligenceRoutes } = await import('./restaurant-intelligence.routes.js')
const { errorHandler } = await import('../middlewares/errorHandler.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/restaurant-intelligence', restaurantIntelligenceRoutes)
  app.use(errorHandler)
  return app
}

function tierOf(tier) {
  return { tier, enabled: tier !== 'none', rawValue: tier, capabilities: {} }
}

describe('restaurant intelligence routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRestaurantIdForRequest.mockResolvedValue('restaurant-1')
    mockGetProductPriceHistory.mockResolvedValue({ productId: 'p1', events: [] })
    mockListPriceChangeAlerts.mockResolvedValue({ alerts: [] })
    mockListCheaperBuyOptions.mockResolvedValue({ options: [] })
    mockListFoodCostWarnings.mockResolvedValue({ warnings: [], coverage: {} })
    mockListWeakMarginMenuItems.mockResolvedValue({ items: [] })
    mockGetWasteIntelligence.mockResolvedValue({ summary: {}, hotspots: [] })
    mockListSupplierReliability.mockResolvedValue({ suppliers: [] })
    mockListOverOrderingIntelligence.mockResolvedValue({ products: [] })
    grantedPermissions = new Set(['CATALOG_VIEW', 'RECIPES_VIEW_COSTS'])
    app = buildApp()
  })

  it('requires CATALOG_VIEW before any intelligence tier is considered', () => {
    expect(requiredPermissions).toContain('CATALOG_VIEW')
  })

  describe('price history (basic tier)', () => {
    it('is available on the Growth basic tier', async () => {
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('basic'))

      const res = await request(app)
        .get('/api/restaurant-intelligence/price-history/product-1')
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(mockGetProductPriceHistory).toHaveBeenCalledWith(
        'restaurant-1',
        'product-1',
        expect.anything()
      )
    })

    it('is refused when the tenant has no intelligence entitlement', async () => {
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('none'))

      await request(app).get('/api/restaurant-intelligence/price-history/product-1').expect(403)

      expect(mockGetProductPriceHistory).not.toHaveBeenCalled()
    })
  })

  describe('price changes and cheaper buys (advanced tier)', () => {
    it.each(['/price-changes', '/cheaper-buys'])(
      '%s is refused on the Growth basic tier',
      async (path) => {
        mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('basic'))

        await request(app).get(`/api/restaurant-intelligence${path}`).expect(403)

        expect(mockListPriceChangeAlerts).not.toHaveBeenCalled()
        expect(mockListCheaperBuyOptions).not.toHaveBeenCalled()
      }
    )

    it.each(['advanced', 'scale'])('is allowed on the %s tier', async (tier) => {
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf(tier))

      await request(app).get('/api/restaurant-intelligence/price-changes').expect(200)
      await request(app).get('/api/restaurant-intelligence/cheaper-buys').expect(200)
    })
  })

  it('derives the restaurant from the session, never from the query string', async () => {
    mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('scale'))

    await request(app)
      .get('/api/restaurant-intelligence/price-changes?restaurantId=someone-else')
      .expect(200)

    expect(mockListPriceChangeAlerts).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({ days: undefined })
    )
    expect(mockListPriceChangeAlerts.mock.calls[0][0]).toBe('restaurant-1')
  })

  it('surfaces a validation error when the session has no restaurant', async () => {
    mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('scale'))
    mockGetRestaurantIdForRequest.mockResolvedValue(null)

    const res = await request(app).get('/api/restaurant-intelligence/price-changes').expect(400)

    expect(res.body.ok).toBe(false)
    expect(mockListPriceChangeAlerts).not.toHaveBeenCalled()
  })

  describe('margin surfaces require the narrower recipe-cost permission', () => {
    const MARGIN_PATHS = ['/food-cost-warnings', '/menu-profitability']

    it('registers RECIPES_VIEW_COSTS, not only CATALOG_VIEW', () => {
      expect(requiredPermissions).toContain('RECIPES_VIEW_COSTS')
      expect(requiredPermissions).toContain('CATALOG_VIEW')
    })

    it.each(MARGIN_PATHS)('%s is refused without RECIPES_VIEW_COSTS', async (path) => {
      // Purchaser and Viewer hold CATALOG_VIEW but must not see portion cost.
      grantedPermissions = new Set(['CATALOG_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('scale'))

      await request(app).get(`/api/restaurant-intelligence${path}`).expect(403)

      expect(mockListFoodCostWarnings).not.toHaveBeenCalled()
      expect(mockListWeakMarginMenuItems).not.toHaveBeenCalled()
    })

    it('price surfaces stay available to a caller with only CATALOG_VIEW', async () => {
      grantedPermissions = new Set(['CATALOG_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

      await request(app).get('/api/restaurant-intelligence/price-changes').expect(200)
    })

    it.each(MARGIN_PATHS)('%s is refused below the advanced tier', async (path) => {
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('basic'))

      await request(app).get(`/api/restaurant-intelligence${path}`).expect(403)

      expect(mockListFoodCostWarnings).not.toHaveBeenCalled()
      expect(mockListWeakMarginMenuItems).not.toHaveBeenCalled()
    })

    it('serves both surfaces on the advanced tier, scoped to the session tenant', async () => {
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

      await request(app).get('/api/restaurant-intelligence/food-cost-warnings').expect(200)
      await request(app).get('/api/restaurant-intelligence/menu-profitability').expect(200)

      expect(mockListFoodCostWarnings.mock.calls[0][0]).toBe('restaurant-1')
      expect(mockListWeakMarginMenuItems.mock.calls[0][0]).toBe('restaurant-1')
    })
  })

  describe('waste intelligence', () => {
    it('requires INVENTORY_VIEW and the advanced tier', async () => {
      expect(requiredPermissions).toContain('INVENTORY_VIEW')
      grantedPermissions = new Set(['CATALOG_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

      await request(app).get('/api/restaurant-intelligence/waste-intelligence').expect(403)
      expect(mockGetWasteIntelligence).not.toHaveBeenCalled()

      grantedPermissions = new Set(['INVENTORY_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('basic'))
      await request(app).get('/api/restaurant-intelligence/waste-intelligence').expect(403)
      expect(mockGetWasteIntelligence).not.toHaveBeenCalled()
    })

    it('serves the session restaurant on the advanced tier', async () => {
      grantedPermissions = new Set(['INVENTORY_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

      await request(app)
        .get('/api/restaurant-intelligence/waste-intelligence?days=90&limit=50&restaurantId=other')
        .expect(200)

      expect(mockGetWasteIntelligence).toHaveBeenCalledWith('restaurant-1', {
        days: '90',
        limit: '50',
      })
    })
  })
  describe('supplier reliability', () => {
    it('requires RECEIVING_VIEW and the advanced tier', async () => {
      expect(requiredPermissions).toContain('RECEIVING_VIEW')
      grantedPermissions = new Set(['CATALOG_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

      await request(app).get('/api/restaurant-intelligence/supplier-reliability').expect(403)
      expect(mockListSupplierReliability).not.toHaveBeenCalled()

      grantedPermissions = new Set(['RECEIVING_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('basic'))
      await request(app).get('/api/restaurant-intelligence/supplier-reliability').expect(403)
      expect(mockListSupplierReliability).not.toHaveBeenCalled()
    })

    it('serves only the session restaurant', async () => {
      grantedPermissions = new Set(['RECEIVING_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

      await request(app)
        .get('/api/restaurant-intelligence/supplier-reliability?days=180&restaurantId=other')
        .expect(200)

      expect(mockListSupplierReliability).toHaveBeenCalledWith('restaurant-1', { days: '180' })
    })
  })
  describe('over-ordering intelligence', () => {
    it('requires both inventory and receiving read permissions before the advanced tier', async () => {
      expect(requiredPermissions).toContain('INVENTORY_VIEW')
      expect(requiredPermissions).toContain('RECEIVING_VIEW')
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

      grantedPermissions = new Set(['INVENTORY_VIEW'])
      await request(app).get('/api/restaurant-intelligence/over-ordering').expect(403)
      expect(mockListOverOrderingIntelligence).not.toHaveBeenCalled()

      grantedPermissions = new Set(['INVENTORY_VIEW', 'RECEIVING_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('basic'))
      await request(app).get('/api/restaurant-intelligence/over-ordering').expect(403)
      expect(mockListOverOrderingIntelligence).not.toHaveBeenCalled()
    })

    it('uses only the session restaurant and passes window controls to the service', async () => {
      grantedPermissions = new Set(['INVENTORY_VIEW', 'RECEIVING_VIEW'])
      mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

      await request(app)
        .get('/api/restaurant-intelligence/over-ordering?days=120&limit=5&restaurantId=other')
        .expect(200)

      expect(mockListOverOrderingIntelligence).toHaveBeenCalledWith('restaurant-1', {
        days: '120',
        limit: '5',
      })
    })
  })

  it('passes client filters through for the service to clamp', async () => {
    mockGetIntelligenceTierForTenant.mockResolvedValue(tierOf('advanced'))

    await request(app)
      .get('/api/restaurant-intelligence/price-changes?days=90&minChangePct=12&direction=down')
      .expect(200)

    expect(mockListPriceChangeAlerts).toHaveBeenCalledWith('restaurant-1', {
      days: '90',
      minChangePct: '12',
      direction: 'down',
      limit: undefined,
    })
  })
})
