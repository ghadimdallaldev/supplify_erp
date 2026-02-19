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
vi.mock('../lib/audit.js', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
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

    it('upgrading to Enterprise (full features) does not list standard features as disabled', async () => {
      const platinumSupplierFeatures = {
        chat: true,
        smart_reorder: true,
        reports: true,
        fulfillment_tools: 'routing_full_suite',
        quick_lists: 'full_schedule',
        inventory_management: 'multi_branch_tracking',
        waste_tracking: 'analytics_dashboard',
        receiving_quality: 'quality_scoring',
        finance_invoices: 'expense_analytics',
        notifications: 'email_and_sms',
        api_integrations: 'api_key_access',
        support_sla: 'priority_24h',
        custom_branding: 'logo_colors',
      }
      const enterpriseSupplierFeatures = {
        ...platinumSupplierFeatures,
        quick_lists: 'ai_smart_automation',
        inventory_management: 'lot_expiry_tracking',
        waste_tracking: 'cost_percentage_vs_sales',
        receiving_quality: 'supplier_performance_reports',
        finance_invoices: 'advanced_finance_dashboard',
        approvals_budgets: 'multi_level_approvals',
        feature_flags_access: 'all_experimental',
        support_sla: 'dedicated_same_day',
        custom_branding: true,
      }
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              tenant_id: 'tenant-1',
              tenant_type: 'SUPPLIER',
              current_limits: {},
              current_features: platinumSupplierFeatures,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'plan-enterprise',
              name: 'Enterprise',
              code: 'enterprise',
              tenant_type: 'SUPPLIER',
              limits: { warehouses: -1, users: -1 },
              features: enterpriseSupplierFeatures,
            },
          ],
        })
      mockGetEntitlements.mockResolvedValueOnce({
        tenantType: 'SUPPLIER',
        tenantId: 'tenant-1',
        usage: {},
        plan: {},
        limits: {},
        baseLimits: {},
        overrides: [],
        features: {},
      })

      const res = await request(app)
        .post('/api/admin-dashboard/subscriptions/sub-1/preview-change')
        .send({ targetPlanId: 'plan-enterprise' })
        .expect(200)

      expect(res.body.ok).toBe(true)
      const { enabled, disabled } = res.body.data.featureDiff
      expect(disabled).not.toContain('quick_lists')
      expect(disabled).not.toContain('waste_tracking')
      expect(disabled).not.toContain('finance_invoices')
      expect(disabled).not.toContain('receiving_quality')
      expect(disabled).not.toContain('inventory_management')
      expect(disabled).not.toContain('approvals_budgets')
      expect(disabled).not.toContain('feature_flags_access')
      expect(enabled.some((k) => ['custom_branding', 'approvals_budgets', 'feature_flags_access'].includes(k))).toBe(true)
    })
  })

  describe('GET /plans', () => {
    it('returns plans when subscription_plan has tenant_type', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'p1',
            code: 'free',
            name: 'Free',
            tenant_type: 'RESTAURANT',
            limits: {},
            features: {},
          },
        ],
      })

      const res = await request(app).get('/api/admin-dashboard/plans').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.plans).toHaveLength(1)
      expect(res.body.data.plans[0].name).toBe('Free')
      expect(res.body.data.plans[0].tenant_type).toBe('RESTAURANT')
    })

    it('returns plans filtered by tenant_type when query param provided', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'p1',
            code: 'bronze',
            name: 'Bronze',
            tenant_type: 'SUPPLIER',
            limits: {},
            features: {},
          },
        ],
      })

      const res = await request(app)
        .get('/api/admin-dashboard/plans?tenant_type=SUPPLIER')
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.plans).toHaveLength(1)
      expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_type = $1'), [
        'SUPPLIER',
      ])
    })

    it('falls back to legacy query when tenant_type column missing (42703)', async () => {
      query
        .mockRejectedValueOnce(
          Object.assign(new Error('column "tenant_type" does not exist'), { code: '42703' })
        )
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', code: 'free', name: 'Free', limits: {}, features: {} }],
        })

      const res = await request(app).get('/api/admin-dashboard/plans').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.plans).toHaveLength(1)
      expect(res.body.data.plans[0].tenant_type).toBe('RESTAURANT')
      expect(query).toHaveBeenCalledTimes(2)
    })

    it('returns empty plans when subscription_plan table does not exist (42P01)', async () => {
      query.mockRejectedValueOnce(
        Object.assign(new Error('relation "subscription_plan" does not exist'), { code: '42P01' })
      )

      const res = await request(app).get('/api/admin-dashboard/plans').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.plans).toEqual([])
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
        .mockResolvedValueOnce({ rows: [{ code: 'free' }] })
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

    it('rejects downgrade when usage exceeds target plan unless force=true with reason', async () => {
      const planIdBronze = 'a0000002-0001-4000-8000-000000000002'
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'sub-1', tenant_id: 't1', tenant_type: 'RESTAURANT', plan_id: 'p-gold' }],
        })
        .mockResolvedValueOnce({ rows: [{ code: 'gold' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: planIdBronze,
              name: 'Bronze',
              tenant_type: 'RESTAURANT',
              limits: { orders_per_day: 10 },
            },
          ],
        })

      mockGetEntitlements.mockResolvedValueOnce({
        usage: { orders_per_day: 50 },
        plan: { code: 'gold' },
      })

      const res = await request(app)
        .patch('/api/admin-dashboard/subscriptions/sub-1')
        .send({ planId: planIdBronze })
        .expect(400)

      expect(res.body.ok).toBe(false)
      expect(res.body.error.name).toBe('LIMIT_EXCEEDED')
    })

    it('allows downgrade when force=true and reason provided', async () => {
      const planIdBronze = 'a0000002-0001-4000-8000-000000000002'
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'sub-1', tenant_id: 't1', tenant_type: 'RESTAURANT', plan_id: 'p-gold' }],
        })
        .mockResolvedValueOnce({ rows: [{ code: 'gold' }] })
        .mockResolvedValueOnce({
          rows: [{ id: planIdBronze, name: 'Bronze', tenant_type: 'RESTAURANT', limits: {} }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              plan_id: planIdBronze,
              plan_name: 'Bronze',
              tenant_id: 't1',
              tenant_type: 'RESTAURANT',
            },
          ],
        })
        .mockResolvedValue({ rows: [] })

      mockGetEntitlements.mockResolvedValueOnce({ usage: { orders_per_day: 5 } })

      const res = await request(app)
        .patch('/api/admin-dashboard/subscriptions/sub-1')
        .send({ planId: planIdBronze, force: true, reason: 'Customer requested downgrade' })
        .expect(200)

      expect(res.body.ok).toBe(true)
    })
  })

  describe('GET /conversion-stats', () => {
    it('returns conversion stats when conversion_event table exists', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ c: '25' }] })
        .mockResolvedValueOnce({ rows: [{ c: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { key: 'reports', c: '10' },
            { key: 'smart_reorder', c: '8' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { key: 'orders_per_day', c: '12' },
            { key: 'chats_per_day', c: '5' },
          ],
        })

      const res = await request(app)
        .get('/api/admin-dashboard/conversion-stats?days=30')
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.days).toBe(30)
      expect(res.body.data.totalBlocks).toBe(25)
      expect(res.body.data.totalUpgrades).toBe(5)
      expect(res.body.data.blocksToUpgradesConversionPercent).toBe(20)
      expect(res.body.data.mostBlockedFeature).toBe('reports')
      expect(res.body.data.mostBlockedLimit).toBe('orders_per_day')
    })

    it('returns zero stats when table does not exist', async () => {
      const err = new Error('relation "conversion_event" does not exist')
      err.code = '42P01'
      query.mockRejectedValueOnce(err)

      const res = await request(app).get('/api/admin-dashboard/conversion-stats').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.totalBlocks).toBe(0)
      expect(res.body.data.totalUpgrades).toBe(0)
    })
  })
})
