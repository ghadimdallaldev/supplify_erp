import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: vi.fn(),
  pool: { query: mockQuery },
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  checkLimit: vi.fn(),
  buildLimitExceededPayload: vi.fn(),
  getTenantSubscription: vi.fn(),
  getRecommendedPlanNames: vi.fn(),
}))

vi.mock('../lib/feature-flags.js', () => ({
  isFeatureEnabledForTenant: vi.fn().mockResolvedValue(true),
}))

vi.mock('../middlewares/request-timing.js', () => ({
  startStage: vi.fn(),
  mark: vi.fn(),
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
  applyReorderAssistance: vi.fn(),
  getReorderAiRecommendations: vi.fn(),
  recordReorderRecommendationFeedback: vi.fn(),
}))

vi.mock('../services/reorder-forecast-cache.service.js', () => ({
  getCachedForecasts: vi.fn(),
  refreshRestaurantForecasts: vi.fn(),
  markReorderForecastDirty: vi.fn(),
}))

vi.mock('../services/reorder-ai.service.js', () => ({
  explainReorderSuggestions: vi.fn(),
  parseReorderIntent: vi.fn(),
}))

vi.mock('../services/restaurant-inventory-import.service.js', () => ({
  previewRestaurantInventoryImport: vi.fn(),
  executeRestaurantInventoryImport: vi.fn(),
}))

vi.mock('../lib/audit.js', () => ({ writeAuditLog: vi.fn() }))
vi.mock('../services/notification.service.js', () => ({ notifyLowStock: vi.fn() }))

describe('restaurant-inventory list pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockImplementation((sql) => {
      if (String(sql).includes('FILTER (WHERE')) {
        return Promise.resolve({ rows: [{ out_of_stock: 0, low_stock: 0, in_stock: 42 }] })
      }
      if (String(sql).includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ total: 42 }] })
      }
      return Promise.resolve({ rows: [{ product_id: 'p1', quantity: 5 }] })
    })
  })

  it('applies default limit 100 and offset 0', async () => {
    const { restaurantInventoryRoutes: router } = await import('./restaurant-inventory.routes.js')
    const app = express().use(router)
    const res = await request(app).get('/').expect(200)
    expect(res.body.data.limit).toBe(100)
    expect(res.body.data.offset).toBe(0)
    expect(res.body.data.total).toBe(42)
    const listSql = mockQuery.mock.calls.find((c) => String(c[0]).includes('LIMIT $2'))?.[0]
    expect(listSql).toBeTruthy()
    expect(mockQuery.mock.calls.find((c) => String(c[0]).includes('LIMIT $2'))?.[1]).toEqual([
      'restaurant-1',
      100,
      0,
    ])
  })

  it('caps limit at 500', async () => {
    const { restaurantInventoryRoutes: router } = await import('./restaurant-inventory.routes.js')
    const app = express().use(router)
    const res = await request(app).get('/?limit=999&offset=10').expect(200)
    expect(res.body.data.limit).toBe(500)
    expect(res.body.data.offset).toBe(10)
    expect(mockQuery.mock.calls.find((c) => String(c[0]).includes('LIMIT $2'))?.[1]).toEqual([
      'restaurant-1',
      500,
      10,
    ])
  })

  it('applies server-side q and status filters', async () => {
    mockQuery.mockImplementation((sql) => {
      if (String(sql).includes('FILTER (WHERE')) {
        return Promise.resolve({ rows: [{ out_of_stock: 1, low_stock: 2, in_stock: 3 }] })
      }
      if (String(sql).includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ total: 2 }] })
      }
      return Promise.resolve({ rows: [{ product_id: 'p1', quantity: 0 }] })
    })
    const { restaurantInventoryRoutes: router } = await import('./restaurant-inventory.routes.js')
    const app = express().use(router)
    const res = await request(app).get('/?q=tomato&status=OUT_OF_STOCK').expect(200)
    expect(res.body.data.total).toBe(2)
    expect(res.body.data.summary).toEqual({ inStock: 3, lowStock: 2, outOfStock: 1 })
    const listCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('WITH filtered'))
    expect(listCall?.[0]).toMatch(/ILIKE \$2/)
    expect(listCall?.[0]).toMatch(/ri\.quantity = 0/)
    expect(listCall?.[1]).toEqual(['restaurant-1', '%tomato%', 100, 0])
  })
})
