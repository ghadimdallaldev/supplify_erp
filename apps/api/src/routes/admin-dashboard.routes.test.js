import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_FEATURE_KEYS } from '../lib/feature-keys.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  pool: { totalCount: 2, idleCount: 1, waitingCount: 0 },
}))
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
  requireAnyPermission: () => (req, res, next) => next(),
}))
vi.mock('../lib/impersonation.js', () => ({
  createImpersonationToken: vi.fn().mockResolvedValue('token'),
  verifyImpersonationToken: vi.fn().mockReturnValue(null),
  getImpersonationCookieName: vi.fn().mockReturnValue('impersonate'),
  getEffectiveTenant: vi.fn().mockReturnValue(null),
}))

const mockGetEntitlements = vi.fn()
const mockResolveActiveBillingSubscription = vi.fn()
vi.mock('../lib/org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: vi.fn(async (tenantId) => tenantId),
  resolveActiveBillingSubscription: (...args) => mockResolveActiveBillingSubscription(...args),
  resolveActiveBillingSubscriptionsBatch: vi.fn(async (tenantIds, tenantType) => {
    const map = new Map()
    for (const id of tenantIds) {
      const billing = await mockResolveActiveBillingSubscription(id, tenantType)
      map.set(id, {
        billingTenantId: billing?.billingTenantId ?? id,
        usesOrgBilling: billing?.usesOrgBilling ?? false,
        subscription: billing?.subscription ?? null,
        plan_code: billing?.subscription?.plan_code,
      })
    }
    return map
  }),
}))
vi.mock('../lib/audit.js', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/billing/billing-service.js', () => ({
  unlockSubscriptionAccount: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/conversion-events.js', () => ({
  recordConversionEvent: vi.fn().mockResolvedValue(undefined),
}))
const mockBuildAdminOverviewMetrics = vi.fn()
vi.mock('../lib/admin-overview-metrics.js', () => ({
  buildAdminOverviewMetrics: (...args) => mockBuildAdminOverviewMetrics(...args),
}))
const mockBuildAdminActivityFeed = vi.fn()
vi.mock('../lib/admin-activity-feed.js', () => ({
  buildAdminActivityFeed: (...args) => mockBuildAdminActivityFeed(...args),
  normalizeActivityEvent: (row) => row,
}))
const mockBuildAdminOperationalSummary = vi.fn()
const mockListAdminEmailDeliveryLogs = vi.fn()
const mockBuildTenantOperationalSnapshot = vi.fn()
const mockGetAdminEmailHealthFailures = vi.fn()
vi.mock('../lib/admin-operational-metrics.js', () => ({
  buildAdminOperationalSummary: (...args) => mockBuildAdminOperationalSummary(...args),
  listAdminEmailDeliveryLogs: (...args) => mockListAdminEmailDeliveryLogs(...args),
  listAdminFulfillmentIssues: vi.fn().mockResolvedValue({ total: 0, issues: [] }),
  listAdminActiveDeliveries: vi.fn().mockResolvedValue({ deliveries: [] }),
  buildTenantOperationalSnapshot: (...args) => mockBuildTenantOperationalSnapshot(...args),
  getAdminEmailHealthFailures: (...args) => mockGetAdminEmailHealthFailures(...args),
}))

vi.mock('../lib/subscription.js', () => ({
  getEntitlements: (...args) => mockGetEntitlements(...args),
  invalidateTenantSubscriptionCache: vi.fn().mockResolvedValue(undefined),
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
    mockResolveActiveBillingSubscription.mockImplementation(async (tenantId, tenantType) => ({
      billingTenantId: tenantId,
      usesOrgBilling: false,
      subscription: {
        id: 'sub-1',
        tenant_id: tenantId,
        tenant_type: tenantType,
        plan_id: 'p-gold',
        status: 'ACTIVE',
      },
    }))
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
              id: 'plan-silver',
              name: 'Silver',
              code: 'silver',
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
        .send({ targetPlanId: 'plan-silver' })
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
            { id: 'plan-sup', name: 'Silver', tenant_type: 'SUPPLIER', limits: {}, features: {} },
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
      expect(
        enabled.some((k) =>
          ['custom_branding', 'approvals_budgets', 'feature_flags_access'].includes(k)
        )
      ).toBe(true)
    })
  })

  describe('GET /overview', () => {
    it('returns overview metrics payload shape', async () => {
      mockBuildAdminOverviewMetrics.mockResolvedValueOnce({
        orders: { today: 1, week: 2, month: 3, total: 9 },
        activeCarts: 1,
        chatsLast24h: 2,
        totalActiveStaff: 3,
        reservations: { today: 0, week: 1, confirmed: 1 },
        tenants: {
          totalSuppliers: 1,
          totalRestaurants: 2,
          newSuppliers7d: 0,
          newRestaurants7d: 0,
        },
        totalActiveProducts: 10,
        totalQuickLists: 1,
        revenue: { mrr: 49, arr: 588, paidActiveSubscriptions: 1, activeSubscriptions: 1 },
        subscriptionStats: { ACTIVE: 1, TRIALING: 1 },
        alerts: {},
        tenantCounts: {},
        activity: { ordersLast24h: 1, chatsLast24h: 2 },
      })

      const res = await request(app).get('/api/admin-dashboard/overview').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.orders.total).toBe(9)
      expect(res.body.data.revenue.paidActiveSubscriptions).toBe(1)
      expect(res.body.data.tenants.totalRestaurants).toBe(2)
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
            code: 'silver',
            name: 'Silver',
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

    it('rejects promotions limit on restaurant plans', async () => {
      const res = await request(app)
        .post('/api/admin-dashboard/plans')
        .send({
          code: 'bad_rest',
          name: 'Bad',
          tenantType: 'RESTAURANT',
          pricePerMonth: 0,
          limits: { promotions: 5 },
          features: {},
        })
        .expect(400)

      expect(res.body.error.message).toMatch(/promotions|Unknown/)
    })

    it('rejects activating enterprise without confirm flag', async () => {
      const res = await request(app)
        .post('/api/admin-dashboard/plans')
        .send({
          code: 'enterprise',
          name: 'Enterprise',
          tenantType: 'RESTAURANT',
          pricePerMonth: 0,
          limits: {},
          features: {},
          isActive: true,
        })
        .expect(400)

      expect(res.body.error.message).toMatch(/confirmEnterpriseActivation/)
    })

    it('rejects free trial_days outside platform bounds', async () => {
      const res = await request(app)
        .post('/api/admin-dashboard/plans')
        .send({
          code: 'free',
          name: 'Free',
          tenantType: 'RESTAURANT',
          pricePerMonth: 0,
          limits: {},
          features: {},
          trialDays: 91,
        })
        .expect(400)

      expect(res.body.error.message).toMatch(/trial_days/)
    })
  })

  describe('PATCH /plans/:id', () => {
    const planId = 'plan-gold-1'
    const goldPlan = {
      id: planId,
      code: 'gold',
      name: 'Gold',
      tenant_type: 'RESTAURANT',
      limits: { orders_per_day: 100, storage_mb: 10240, users: 15, branches: 3 },
      features: { reports: true },
      trial_days: 0,
    }

    it('rejects invalid limits JSON shape', async () => {
      query.mockResolvedValueOnce({ rows: [goldPlan] })

      const res = await request(app)
        .patch(`/api/admin-dashboard/plans/${planId}`)
        .send({ limits: [] })
        .expect(400)

      expect(res.body.error.message).toMatch(/JSON object|Invalid plan data|must be a JSON object/)
    })

    it('rejects removed approvals_budgets feature', async () => {
      query.mockResolvedValueOnce({ rows: [goldPlan] })

      const res = await request(app)
        .patch(`/api/admin-dashboard/plans/${planId}`)
        .send({ features: { approvals_budgets: true } })
        .expect(400)

      expect(res.body.error.message).toMatch(/approvals_budgets/)
    })

    it('returns tier ladder warnings without blocking save', async () => {
      const updatedLimits = { orders_per_day: 5, storage_mb: 10240, users: 15, branches: 3 }
      query.mockImplementation(async (sql) => {
        if (
          typeof sql === 'string' &&
          sql.includes('WHERE id = $1') &&
          sql.includes('subscription_plan')
        ) {
          return { rows: [goldPlan] }
        }
        if (typeof sql === 'string' && sql.includes('id != $2')) {
          return { rows: [{ code: 'silver', limits: { orders_per_day: 20 } }] }
        }
        if (typeof sql === 'string' && sql.includes('UPDATE subscription_plan')) {
          return { rows: [{ ...goldPlan, limits: updatedLimits }] }
        }
        return { rows: [] }
      })

      const res = await request(app)
        .patch(`/api/admin-dashboard/plans/${planId}`)
        .send({ limits: updatedLimits })
        .expect(200)

      expect(res.body.data.validationWarnings?.length).toBeGreaterThan(0)
      expect(res.body.data.validationWarnings[0]).toMatch(/silver/)
    })

    it('persists -1 unlimited branches on PATCH', async () => {
      const updatedLimits = { ...goldPlan.limits, branches: -1 }
      query.mockImplementation(async (sql) => {
        if (
          typeof sql === 'string' &&
          sql.includes('WHERE id = $1') &&
          sql.includes('subscription_plan')
        ) {
          return { rows: [goldPlan] }
        }
        if (typeof sql === 'string' && sql.includes('id != $2')) {
          return { rows: [{ code: 'silver', limits: { orders_per_day: 20, branches: 1 } }] }
        }
        if (typeof sql === 'string' && sql.includes('UPDATE subscription_plan')) {
          return { rows: [{ ...goldPlan, limits: updatedLimits }] }
        }
        return { rows: [] }
      })

      const res = await request(app)
        .patch(`/api/admin-dashboard/plans/${planId}`)
        .send({ limits: updatedLimits })
        .expect(200)

      expect(res.body.data.plan.limits.branches).toBe(-1)
    })

    it('persists tier string and boolean features on PATCH', async () => {
      const updatedFeatures = {
        reports: 'usage_cost_dashboards',
        finance_invoices: 'expense_analytics',
        fulfillment_tools: false,
      }
      query.mockImplementation(async (sql) => {
        if (
          typeof sql === 'string' &&
          sql.includes('WHERE id = $1') &&
          sql.includes('subscription_plan')
        ) {
          return { rows: [goldPlan] }
        }
        if (typeof sql === 'string' && sql.includes('UPDATE subscription_plan')) {
          return { rows: [{ ...goldPlan, features: updatedFeatures }] }
        }
        return { rows: [] }
      })

      const res = await request(app)
        .patch(`/api/admin-dashboard/plans/${planId}`)
        .send({ features: updatedFeatures })
        .expect(200)

      expect(res.body.data.plan.features.reports).toBe('usage_cost_dashboards')
      expect(res.body.data.plan.features.finance_invoices).toBe('expense_analytics')
      expect(res.body.data.plan.features.fulfillment_tools).toBe(false)
    })

    it('blocks activating enterprise without confirm flag', async () => {
      query.mockResolvedValueOnce({
        rows: [{ ...goldPlan, code: 'enterprise', is_active: false }],
      })

      const res = await request(app)
        .patch(`/api/admin-dashboard/plans/${planId}`)
        .send({ isActive: true })
        .expect(400)

      expect(res.body.error.message).toMatch(/confirmEnterpriseActivation/)
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
          rows: [{ id: planIdSupplier, name: 'Silver', tenant_type: 'SUPPLIER' }],
        })

      const res = await request(app)
        .patch('/api/admin-dashboard/subscriptions/sub-1')
        .send({ planId: planIdSupplier })
        .expect(400)

      expect(res.body.ok).toBe(false)
      expect(res.body.error.message).toMatch(/Plan tenant_type must match/)
    })

    it('rejects downgrade when usage exceeds target plan unless force=true with reason', async () => {
      const planIdSilver = 'a0000002-0001-4000-8000-000000000002'
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'sub-1', tenant_id: 't1', tenant_type: 'RESTAURANT', plan_id: 'p-gold' }],
        })
        .mockResolvedValueOnce({ rows: [{ code: 'gold' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: planIdSilver,
              name: 'Silver',
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
        .send({ planId: planIdSilver })
        .expect(400)

      expect(res.body.ok).toBe(false)
      expect(res.body.error.name).toBe('LIMIT_EXCEEDED')
    })

    it('allows downgrade when force=true and reason provided', async () => {
      const planIdSilver = 'a0000002-0001-4000-8000-000000000002'
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'sub-1', tenant_id: 't1', tenant_type: 'RESTAURANT', plan_id: 'p-gold' }],
        })
        .mockResolvedValueOnce({ rows: [{ code: 'gold' }] })
        .mockResolvedValueOnce({
          rows: [{ id: planIdSilver, name: 'Silver', tenant_type: 'RESTAURANT', limits: {} }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              plan_id: planIdSilver,
              plan_name: 'Silver',
              tenant_id: 't1',
              tenant_type: 'RESTAURANT',
            },
          ],
        })
        .mockResolvedValue({ rows: [] })

      mockGetEntitlements.mockResolvedValueOnce({ usage: { orders_per_day: 5 } })

      const res = await request(app)
        .patch('/api/admin-dashboard/subscriptions/sub-1')
        .send({ planId: planIdSilver, force: true, reason: 'Customer requested downgrade' })
        .expect(200)

      expect(res.body.ok).toBe(true)
    })

    it('applies plan change to org billing subscription when branch row was selected', async () => {
      const planIdGold = 'a0000002-0001-4000-8000-000000000003'
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-branch',
              tenant_id: 'branch-1',
              tenant_type: 'RESTAURANT',
              plan_id: 'p-free',
              status: 'ACTIVE',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-main',
              tenant_id: 'main-1',
              tenant_type: 'RESTAURANT',
              plan_id: 'p-free',
              status: 'ACTIVE',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ code: 'free' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: planIdGold,
              name: 'Gold',
              tenant_type: 'RESTAURANT',
              limits: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-main',
              plan_id: planIdGold,
              plan_name: 'Gold',
              tenant_id: 'main-1',
              tenant_type: 'RESTAURANT',
            },
          ],
        })
        .mockResolvedValue({ rows: [] })

      mockResolveActiveBillingSubscription.mockResolvedValueOnce({
        billingTenantId: 'main-1',
        usesOrgBilling: true,
        subscription: {
          id: 'sub-main',
          tenant_id: 'main-1',
          tenant_type: 'RESTAURANT',
          plan_id: 'p-free',
          status: 'ACTIVE',
        },
      })

      mockGetEntitlements.mockResolvedValueOnce({ usage: { orders_per_day: 1 } })

      const res = await request(app)
        .patch('/api/admin-dashboard/subscriptions/sub-branch')
        .send({ planId: planIdGold })
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.appliedViaOrgBilling).toBe(true)
      expect(res.body.data.subscription.plan_id).toBe(planIdGold)
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

  describe('GET /feature-flags', () => {
    it('returns global feature flags', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            feature_key: 'reports',
            feature_name: 'Reports',
            description: null,
            global_override: null,
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      })

      const res = await request(app).get('/api/admin-dashboard/feature-flags').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.flags).toHaveLength(ALL_FEATURE_KEYS.length)
      const reports = res.body.data.flags.find((f) => f.featureKey === 'reports')
      expect(reports.featureName).toBe('Reports')
      expect(reports.globalOverride).toBe(null)
    })
  })

  describe('GET /tenants/suppliers', () => {
    it('returns paginated suppliers with total', async () => {
      query.mockImplementation(async (sql) => {
        if (typeof sql === 'string' && sql.includes('information_schema.columns')) {
          return { rows: [] }
        }
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT COUNT(*)::int AS total FROM supplier')
        ) {
          return { rows: [{ total: 120 }] }
        }
        if (typeof sql === 'string' && sql.includes('FROM supplier s')) {
          return {
            rows: [
              {
                id: 's1',
                name: 'Supplier One',
                product_count: 3,
                warehouse_count: 1,
                active_deals_count: 2,
                storage_mb_used: 120,
              },
            ],
          }
        }
        return { rows: [] }
      })

      const res = await request(app)
        .get('/api/admin-dashboard/tenants/suppliers?limit=50&offset=0')
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.suppliers).toHaveLength(1)
      expect(res.body.data.suppliers[0].active_deals_count).toBe(2)
      expect(res.body.data.suppliers[0].storage_mb_used).toBe(120)
      expect(res.body.data.total).toBe(120)
      expect(res.body.data.limit).toBe(50)
      expect(res.body.data.offset).toBe(0)
    })
  })

  describe('GET /tenants/restaurants', () => {
    it('returns restaurant usage fields when present', async () => {
      query.mockImplementation(async (sql) => {
        if (typeof sql === 'string' && sql.includes('information_schema.columns')) {
          return { rows: [] }
        }
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT COUNT(*)::int AS total FROM restaurant')
        ) {
          return { rows: [{ total: 40 }] }
        }
        if (typeof sql === 'string' && sql.includes('FROM restaurant r')) {
          return {
            rows: [
              {
                id: 'r1',
                name: 'Cafe One',
                orders_last_30d: 51,
                orders_today: 2,
                connected_suppliers_count: 6,
                inventory_skus_count: 240,
                storage_mb_used: null,
              },
            ],
          }
        }
        return { rows: [] }
      })

      const res = await request(app)
        .get('/api/admin-dashboard/tenants/restaurants?limit=50&offset=0')
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.restaurants[0].orders_today).toBe(2)
      expect(res.body.data.restaurants[0].connected_suppliers_count).toBe(6)
      expect(res.body.data.restaurants[0].inventory_skus_count).toBe(240)
      expect(res.body.data.restaurants[0].storage_mb_used).toBeNull()
    })
  })

  describe('GET /activity', () => {
    it('returns composed activity feed with expected shape', async () => {
      mockBuildAdminActivityFeed.mockResolvedValueOnce({
        events: [
          {
            id: '1',
            event_type: 'order_placed',
            type: 'order_placed',
            title: 'Order placed — Cafe',
            description: 'Cafe → Supplier',
            occurred_at: '2026-05-28T12:00:00.000Z',
            createdAt: '2026-05-28T12:00:00.000Z',
            actorName: 'Cafe',
            tenantName: 'Cafe',
            tenantType: 'RESTAURANT',
          },
        ],
        total: 1,
        limit: 30,
        offset: 0,
        sources: ['order_placed', 'new_tenant'],
        failedSources: [],
        partial: false,
      })

      const res = await request(app).get('/api/admin-dashboard/activity?limit=30').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.events).toHaveLength(1)
      expect(res.body.data.events[0].event_type).toBe('order_placed')
      expect(res.body.data.total).toBe(1)
      expect(mockBuildAdminActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 30, offset: 0, days: 30, type: null })
      )
    })

    it('passes days window to activity feed builder', async () => {
      mockBuildAdminActivityFeed.mockResolvedValueOnce({
        events: [],
        total: 0,
        limit: 30,
        offset: 0,
        days: 7,
        sources: [],
        failedSources: [],
        partial: false,
      })

      await request(app).get('/api/admin-dashboard/activity?days=7').expect(200)

      expect(mockBuildAdminActivityFeed).toHaveBeenCalledWith(expect.objectContaining({ days: 7 }))
    })
  })

  describe('GET /operational-summary', () => {
    it('returns operational summary for admin', async () => {
      mockBuildAdminOperationalSummary.mockResolvedValueOnce({
        email: { failed24h: 2, enabled: true },
        warnings: [{ id: 'email-high-failures', severity: 'warning', message: '2 failed' }],
      })
      const res = await request(app).get('/api/admin-dashboard/operational-summary').expect(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.summary.email.failed24h).toBe(2)
    })
  })

  describe('GET /operational/email-logs', () => {
    it('returns redacted email logs without secrets', async () => {
      mockListAdminEmailDeliveryLogs.mockResolvedValueOnce({
        total: 1,
        limit: 50,
        offset: 0,
        logs: [
          {
            id: '1',
            recipientRedacted: 'se***@example.com',
            status: 'failed',
            eventType: 'test',
          },
        ],
      })
      const res = await request(app).get('/api/admin-dashboard/operational/email-logs').expect(200)
      expect(res.body.data.logs[0].recipientRedacted).toMatch(/\*\*\*/)
      expect(JSON.stringify(res.body)).not.toContain('SMTP_PASS')
    })
  })

  describe('GET /tenants/:tenantType/:id/operational-snapshot', () => {
    it('returns supplier snapshot without GPS history', async () => {
      mockBuildTenantOperationalSnapshot.mockResolvedValueOnce({
        tenantId: 's1',
        tenantType: 'SUPPLIER',
        supplier: { driverCount: 1, gpsToday: { live: 0, stale: 0, noGps: 0, failed: 0 } },
      })
      const res = await request(app)
        .get('/api/admin-dashboard/tenants/SUPPLIER/s1/operational-snapshot')
        .expect(200)
      expect(res.body.data.snapshot.supplier.driverCount).toBe(1)
      expect(JSON.stringify(res.body)).not.toMatch(/driver_location_ping/)
    })
  })

  describe('GET /health email failures', () => {
    it('includes emailFailures from delivery log', async () => {
      mockGetAdminEmailHealthFailures.mockResolvedValueOnce([
        { id: '1', recipientRedacted: 'a***@b.com', eventType: 'x', status: 'failed' },
      ])
      query.mockResolvedValue({ rows: [] })
      const res = await request(app).get('/api/admin-dashboard/health').expect(200)
      expect(res.body.data.emailFailures).toHaveLength(1)
      expect(res.body.data.emailFailures[0].recipientRedacted).toBeDefined()
    })
  })

  describe('PATCH /feature-flags/:featureKey', () => {
    it('updates global feature override', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            feature_key: 'chat',
            feature_name: 'Chat',
            description: null,
            global_override: false,
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      })

      const res = await request(app)
        .patch('/api/admin-dashboard/feature-flags/chat')
        .send({ mode: 'off' })
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.flag.globalOverride).toBe(false)
    })
  })
})
