import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ query: vi.fn() }))
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  resolveAdminContext: (req, res, next) => {
    req.userData = req.userData || { id: 'admin-1', email: 'admin@test.com', role: 'ADMIN' }
    req.adminContext = { permissions: ['ADMIN_ACCESS'] }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
}))
vi.mock('../lib/impersonation.js', () => ({
  createImpersonationToken: vi.fn().mockResolvedValue('token'),
  verifyImpersonationToken: vi.fn().mockReturnValue(null),
  getImpersonationCookieName: vi.fn().mockReturnValue('impersonate'),
  getEffectiveTenant: vi.fn().mockReturnValue(null),
}))

const mockGetEntitlements = vi.fn()
vi.mock('../lib/subscription.js', () => ({
  getEntitlements: (...args) => mockGetEntitlements(...args),
  RESTAURANT_LIMIT_KEYS: [
    'branches',
    'users',
    'orders_per_day',
    'suppliers_per_restaurant',
    'restaurant_inventory_skus',
    'chats_per_day',
    'storage_mb',
  ],
  SUPPLIER_LIMIT_KEYS: [
    'warehouses',
    'users',
    'supplier_products_skus',
    'chats_per_day',
    'storage_mb',
  ],
}))

import adminDashboardRoutes from './admin-dashboard.routes.js'

describe('Admin Dashboard Routes', () => {
  let app
  let query

  beforeEach(async () => {
    vi.clearAllMocks()
    const db = await import('../lib/db.js')
    query = db.query
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-id'
      next()
    })
    app.use('/api/admin-dashboard', adminDashboardRoutes)
  })

  describe('POST /subscriptions/:id/preview-change', () => {
    it('returns willExceed when current usage exceeds target plan limits', async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              tenant_id: 'tenant-1',
              tenant_type: 'RESTAURANT',
              current_limits: { orders_per_day: 100 },
              current_features: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'plan-bronze',
              name: 'Bronze',
              code: 'bronze',
              tenant_type: 'RESTAURANT',
              limits: { orders_per_day: 50 },
              features: {},
            },
          ],
        })
      mockGetEntitlements.mockResolvedValueOnce({
        tenantType: 'RESTAURANT',
        tenantId: 'tenant-1',
        usage: { orders_per_day: 80 },
        plan: {},
        limits: {},
        baseLimits: {},
        overrides: [],
        features: {},
      })

      const res = await request(app)
        .post('/api/admin-dashboard/subscriptions/sub-1/preview-change')
        .send({ targetPlanId: 'plan-bronze' })
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.willExceed).toBeDefined()
      expect(res.body.data.willExceed.length).toBeGreaterThan(0)
      expect(
        res.body.data.willExceed.some(
          (e) => e.limitKey === 'orders_per_day' && e.usage === 80 && e.limit === 50
        )
      ).toBe(true)
    })

    it('returns 400 when target plan tenant_type does not match subscription', async () => {
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'sub-1', tenant_id: 't1', tenant_type: 'RESTAURANT' }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'plan-sup', name: 'Bronze', tenant_type: 'SUPPLIER', limits: {}, features: {} },
          ],
        })

      const res = await request(app)
        .post('/api/admin-dashboard/subscriptions/sub-1/preview-change')
        .send({ targetPlanId: 'plan-sup' })
        .expect(400)

      expect(res.body.ok).toBe(false)
      expect(res.body.error.message).toMatch(/tenant_type must match/)
    })
  })

  describe('POST /plans', () => {
    it('rejects unknown limit keys for tenant type', async () => {
      const res = await request(app)
        .post('/api/admin-dashboard/plans')
        .send({
          code: 'custom',
          name: 'Custom',
          tenantType: 'RESTAURANT',
          pricePerMonth: 0,
          limits: { unknown_key: 999 },
          features: {},
        })
        .expect(400)

      expect(res.body.ok).toBe(false)
      expect(res.body.error.message).toMatch(/Unknown keys not allowed/)
    })
  })

  describe('PATCH /subscriptions/:id', () => {
    it('rejects plan change when plan tenant_type does not match subscription', async () => {
      const planIdSupplier = 'a0000002-0001-4000-8000-000000000001'
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'sub-1', tenant_id: 't1', tenant_type: 'RESTAURANT', plan_id: 'p1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: planIdSupplier, name: 'Bronze', tenant_type: 'SUPPLIER' }],
        })

      const res = await request(app)
        .patch('/api/admin-dashboard/subscriptions/sub-1')
        .send({ planId: planIdSupplier })
        .expect(400)

      expect(res.body.ok).toBe(false)
      expect(res.body.error.message).toMatch(/Plan tenant_type must match/)
    })
  })
})
