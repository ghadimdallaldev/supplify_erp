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

/** Permission middleware records what it was asked to enforce. */
const requiredPermissions = []

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
    return (_req, _res, next) => next()
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

vi.mock('../services/restaurant-price-intelligence.service.js', () => ({
  getProductPriceHistory: (...args) => mockGetProductPriceHistory(...args),
  listPriceChangeAlerts: (...args) => mockListPriceChangeAlerts(...args),
  listCheaperBuyOptions: (...args) => mockListCheaperBuyOptions(...args),
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
