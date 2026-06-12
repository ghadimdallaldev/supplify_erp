/**
 * Route-level gates for AI smart reorder explain/ask endpoints.
 */
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetFeatureGates,
  setFeatureEnabled,
  mockSubscriptionModule,
} from '../test/feature-gate-mock.js'

const mockGetTenantSubscription = vi.fn()
const mockExplainReorderSuggestions = vi.fn()
const mockParseReorderIntent = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
}))

vi.mock('../lib/subscription.js', () => ({
  ...mockSubscriptionModule(),
  getTenantSubscription: (...args) => mockGetTenantSubscription(...args),
  checkLimit: vi.fn().mockResolvedValue({
    allowed: true,
    current: 0,
    limit: 100,
    isOverLimit: false,
    isUnlimited: false,
  }),
  buildLimitExceededPayload: vi.fn(),
  getRecommendedPlanNames: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/feature-flags.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isFeatureEnabledForTenant: vi.fn().mockResolvedValue(true),
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../services/inventory-expiry.service.js', () => ({
  listExpiryLots: vi.fn(),
  getExpirySummary: vi.fn(),
  createExpiryLot: vi.fn(),
  updateExpiryLot: vi.fn(),
  archiveExpiryLot: vi.fn(),
  getExpirySettings: vi.fn(),
  updateExpirySettings: vi.fn(),
  runExpiryReminderCheck: vi.fn(),
}))

vi.mock('../services/reorder-cadence.service.js', () => ({
  listRestaurantReminders: vi.fn(),
  recomputeCadencePatterns: vi.fn(),
}))

vi.mock('../services/restaurant-reorder-assistance.service.js', () => ({
  getReorderAssistance: vi.fn(),
  suppressReorderSuggestion: vi.fn(),
}))

vi.mock('../services/reorder-forecast-cache.service.js', () => ({
  getCachedForecasts: vi.fn(),
  refreshRestaurantForecasts: vi.fn(),
  markReorderForecastDirty: vi.fn(),
}))

vi.mock('../services/reorder-ai.service.js', () => ({
  explainReorderSuggestions: (...args) => mockExplainReorderSuggestions(...args),
  parseReorderIntent: (...args) => mockParseReorderIntent(...args),
}))

import { restaurantInventoryRoutes } from './restaurant-inventory.routes.js'

describe('restaurant inventory reorder AI routes', () => {
  let app

  beforeEach(async () => {
    vi.clearAllMocks()
    resetFeatureGates({
      inventory_management: true,
      smart_reorder: true,
    })
    mockGetTenantSubscription.mockResolvedValue({
      features: { smart_reorder: 'full_90day_trends' },
    })
    mockExplainReorderSuggestions.mockResolvedValue({
      usedLlm: false,
      source: 'heuristic',
      items: [],
    })
    mockParseReorderIntent.mockResolvedValue({
      usedLlm: false,
      matchedProducts: [{ productId: 'p1', productName: 'Tomatoes', suggestedQty: 3 }],
      interpretation: 'Reorder tomatoes',
    })

    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.requestId = 'reorder-ai-route-test'
      req.user = { id: 'user-1' }
      req.userData = { id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = {
        tenantId: 'restaurant-1',
        tenantType: 'RESTAURANT',
        permissions: ['INVENTORY_VIEW'],
      }
      next()
    })
    app.use('/api/restaurant-inventory', restaurantInventoryRoutes)
    app.use(errorHandler)
  })

  describe('POST /api/restaurant-inventory/reorder-assistance/explain', () => {
    it('returns 403 when smart_reorder feature is off', async () => {
      setFeatureEnabled('smart_reorder', false)

      const res = await request(app)
        .post('/api/restaurant-inventory/reorder-assistance/explain')
        .send({})

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error?.name).toBe('FEATURE_NOT_AVAILABLE')
      expect(mockExplainReorderSuggestions).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/restaurant-inventory/reorder-assistance/ask', () => {
    it('returns 403 when tier is gold (no seasonality)', async () => {
      mockGetTenantSubscription.mockResolvedValue({
        features: { smart_reorder: 'full_90day_trends' },
      })

      const res = await request(app)
        .post('/api/restaurant-inventory/reorder-assistance/ask')
        .send({ query: 'what should I reorder?' })

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error?.name).toBe('FORBIDDEN')
      expect(mockParseReorderIntent).not.toHaveBeenCalled()
    })

    it('returns allowed response shape when tier is platinum', async () => {
      mockGetTenantSubscription.mockResolvedValue({
        features: { smart_reorder: 'ai_forecast_seasonality' },
      })

      const res = await request(app)
        .post('/api/restaurant-inventory/reorder-assistance/ask')
        .send({ query: 'tomatoes and onions' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data).toMatchObject({
        usedLlm: false,
        matchedProducts: expect.arrayContaining([
          expect.objectContaining({ productId: 'p1', productName: 'Tomatoes' }),
        ]),
      })
      expect(mockParseReorderIntent).toHaveBeenCalledWith(
        'restaurant-1',
        expect.objectContaining({
          query: 'tomatoes and onions',
          smartReorderFeatureValue: 'ai_forecast_seasonality',
        })
      )
    })
  })
})
