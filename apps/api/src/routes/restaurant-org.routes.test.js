import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockUser, clearAllMocks } from '../test/helpers.js'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: async (fn) => fn({ query: (...args) => queryMock(...args) }),
}))

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-main'),
    resolveAdminContext: (req, _res, next) => {
      if (req.userData?.role === 'ADMIN') {
        req.adminContext = req.adminContext || {
          permissions: ['ADMIN_TENANTS', 'ADMIN_ACCESS'],
        }
      } else {
        req.adminContext = null
      }
      next()
    },
  })
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/intelligence-tier.js', () => ({
  requireIntelligenceTier: () => (req, res, next) => next(),
}))

vi.mock('../lib/feature-flags.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getResolvedFeatureValue: vi.fn().mockResolvedValue('ai_forecast_seasonality'),
}))

vi.mock('../lib/plan-enforcement.js', () => ({
  checkLinkedAccountLimit: vi.fn().mockResolvedValue({ allowed: true }),
  createAuditLog: vi.fn(),
}))

vi.mock('../lib/restaurant-org.js', () => ({
  getUserRestaurantOrgMembership: vi.fn().mockResolvedValue({
    organization_id: 'org-1',
    organization_name: 'Test Rest Org',
    role_name: 'Org Owner',
  }),
  listRestaurantOrgBranches: vi.fn().mockResolvedValue([]),
  listRestaurantOrgBranchesForUser: vi.fn().mockResolvedValue([
    {
      id: 'restaurant-main',
      name: 'Main',
      is_main_branch: true,
      staff_count: 2,
      orders_this_month: 5,
    },
    {
      id: 'restaurant-2',
      name: 'North',
      is_main_branch: false,
      staff_count: 1,
      orders_this_month: 2,
    },
  ]),
  createRestaurantOrgBranch: vi.fn().mockResolvedValue({ id: 'restaurant-3', name: 'East' }),
  deactivateRestaurantOrgBranch: vi.fn(),
  reactivateRestaurantOrgBranch: vi.fn().mockResolvedValue({ ok: true, organizationId: 'org-1' }),
  unlinkRestaurantFromOrganization: vi
    .fn()
    .mockResolvedValue({ ok: true, organizationId: 'org-1' }),
  userHasRestaurantOrgBranchAccess: vi.fn().mockResolvedValue(true),
  assignRestaurantOrgUserRole: vi.fn(),
  grantRestaurantOrgBranchAccess: vi.fn(),
  revokeRestaurantOrgBranchAccess: vi.fn(),
  invalidateRestaurantOrgPermissionCaches: vi.fn(),
}))

vi.mock('../lib/tenant-switch.js', () => ({
  createActiveTenantToken: vi.fn().mockResolvedValue('token'),
  getActiveTenantCookieName: () => 'active_tenant_token',
  userCanAccessTenant: vi.fn().mockResolvedValue(true),
  isTenantBranchActive: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/branch-account-link-invitations.js', () => ({
  createBranchAccountLinkInvitation: vi.fn(),
  listBranchAccountLinkInvitations: vi.fn().mockResolvedValue([]),
  cancelBranchAccountLinkInvitation: vi.fn(),
  resendBranchAccountLinkInvitation: vi.fn(),
}))

vi.mock('../lib/branch-account-billing.js', () => ({
  applyOrgBillingOnUnlink: vi.fn().mockResolvedValue({ ok: true }),
  recordBranchAccountLinkHistory: vi.fn(),
}))

vi.mock('../services/org-reports.service.js', () => ({
  restaurantOrgConsolidatedOverview: vi.fn().mockResolvedValue({
    data: {
      kpis: { order_count: 4, total_spend: 200, active_branch_accounts: 2 },
      by_branch: [],
    },
    meta: {},
  }),
  restaurantOrgAdvancedAnalytics: vi.fn().mockResolvedValue({ data: { months: [] }, meta: {} }),
  restaurantOrgStockTransferSuggestions: vi
    .fn()
    .mockResolvedValue({ data: { suggestions: [] }, meta: {} }),
  restaurantOrgCrossBranchPurchasingInsights: vi.fn().mockResolvedValue({
    data: {
      signals: [],
      coverage: {
        source: 'latest_order_line_price_snapshots',
        comparableOnly: 'same_product_and_supplier',
      },
    },
    meta: {},
  }),
  restaurantOrgBranchDemandForecast: vi.fn().mockResolvedValue({
    data: {
      branches: [],
      coverage: { scope: 'restaurant_account_aggregate_only', source: 'cached_reorder_forecast' },
    },
    meta: {},
  }),
  restaurantOrgBranchComparison: vi.fn().mockResolvedValue({
    data: {
      branches: [],
      coverage: { foodCost: { available: false, reason: 'no_shared_recipe_identity_model' } },
    },
    meta: {},
  }),
}))

vi.mock('../lib/permissions.js', () => ({
  invalidateUserPermissionCache: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../config/env.js', () => ({
  config: { NODE_ENV: 'test' },
}))

vi.mock('../lib/impersonation.js', () => ({
  getEffectiveTenant: vi.fn(() => null),
}))

import restaurantOrgRoutes from './restaurant-org.routes.js'
import * as restaurantOrg from '../lib/restaurant-org.js'
import { getEffectiveTenant } from '../lib/impersonation.js'
import { getResolvedFeatureValue } from '../lib/feature-flags.js'
import {
  restaurantOrgBranchComparison,
  restaurantOrgBranchDemandForecast,
  restaurantOrgCrossBranchPurchasingInsights,
  restaurantOrgStockTransferSuggestions,
  restaurantOrgAdvancedAnalytics,
  restaurantOrgConsolidatedOverview,
} from '../services/org-reports.service.js'

describe('restaurant-org.routes', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    getEffectiveTenant.mockReturnValue(null)
    getResolvedFeatureValue.mockResolvedValue('ai_forecast_seasonality')
    restaurantOrg.getUserRestaurantOrgMembership.mockReset()
    restaurantOrg.getUserRestaurantOrgMembership.mockResolvedValue({
      organization_id: 'org-1',
      organization_name: 'Test Rest Org',
      role_name: 'Org Owner',
    })
    queryMock.mockReset()
    queryMock.mockImplementation(async (sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('SELECT organization_id FROM restaurant WHERE id = $1')) {
        return { rows: [{ organization_id: 'org-1' }] }
      }
      if (text.includes('SELECT name FROM restaurant_organizations WHERE id = $1')) {
        return { rows: [{ name: 'Test Rest Org' }] }
      }
      if (text.includes('is_main_branch')) {
        return { rows: [{ id: 'restaurant-main' }] }
      }
      if (text.includes('SELECT id, name, is_branch_active FROM restaurant WHERE id = $1')) {
        return { rows: [{ id: 'restaurant-2', name: 'North', is_branch_active: true }] }
      }
      if (text.includes('SELECT id, name FROM restaurant WHERE id = $1')) {
        return { rows: [{ id: 'restaurant-2', name: 'North' }] }
      }
      if (text.includes('SELECT id FROM restaurant WHERE organization_id')) {
        return { rows: [{ id: 'restaurant-main' }] }
      }
      if (text.includes('SELECT * FROM restaurant WHERE id = $1')) {
        return { rows: [{ id: 'restaurant-main', name: 'Main', is_main_branch: true }] }
      }
      return { rows: [] }
    })
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test'
      req.userData = { ...mockUser, id: 'user-1', email: 'owner@restaurant.com' }
      next()
    })
    app.use('/api/restaurant-org', restaurantOrgRoutes)
  })

  it('GET / returns organization and Branch Accounts', async () => {
    const res = await request(app).get('/api/restaurant-org').expect(200)
    expect(res.body.data.organization.id).toBe('org-1')
    expect(res.body.data.branches).toHaveLength(2)
  })
  it('keeps central purchasing permanently unavailable', async () => {
    const res = await request(app).get('/api/restaurant-org/central-purchasing/drafts').expect(410)
    expect(res.body.error.name).toBe('GONE')
  })

  it('GET /branches lists Branch Accounts', async () => {
    const res = await request(app).get('/api/restaurant-org/branches').expect(200)
    expect(res.body.data.branches).toHaveLength(2)
  })

  it('POST /branches creates Branch Account for Org Owner', async () => {
    const res = await request(app)
      .post('/api/restaurant-org/branches')
      .send({ name: 'East Branch' })
      .expect(201)
    expect(restaurantOrg.createRestaurantOrgBranch).toHaveBeenCalled()
    expect(res.body.data.branch.name).toBe('East')
  })

  it('POST /context/switch sets cookie', async () => {
    const res = await request(app)
      .post('/api/restaurant-org/context/switch')
      .send({ restaurant_id: 'restaurant-2' })
      .expect(200)
    expect(res.body.data.activeRestaurantId).toBe('restaurant-2')
    expect(res.headers['set-cookie']?.[0]).toContain('active_tenant_token=')
  })

  it('DELETE /branches/:id delegates to deactivateRestaurantOrgBranch', async () => {
    restaurantOrg.deactivateRestaurantOrgBranch.mockResolvedValueOnce({
      ok: false,
      reason: 'MAIN_BRANCH',
    })
    const res = await request(app)
      .delete('/api/restaurant-org/branches/restaurant-main')
      .expect(403)
    expect(res.body.error.name).toBe('MAIN_BRANCH')
  })

  it('DELETE /branches/:id rejects Branch Accounts outside the organization', async () => {
    restaurantOrg.userHasRestaurantOrgBranchAccess.mockResolvedValueOnce(false)
    const res = await request(app)
      .delete('/api/restaurant-org/branches/foreign-restaurant')
      .expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
    expect(restaurantOrg.deactivateRestaurantOrgBranch).not.toHaveBeenCalled()
  })

  it('POST /branches/:id/reactivate delegates to reactivateRestaurantOrgBranch', async () => {
    const res = await request(app)
      .post('/api/restaurant-org/branches/restaurant-2/reactivate')
      .expect(200)
    expect(restaurantOrg.reactivateRestaurantOrgBranch).toHaveBeenCalledWith(
      'restaurant-2',
      'org-1'
    )
    expect(res.body.data.reactivated).toBe(true)
  })

  it('POST /branches/:id/reactivate rejects Branch Accounts outside the organization', async () => {
    restaurantOrg.userHasRestaurantOrgBranchAccess.mockResolvedValueOnce(false)
    const res = await request(app)
      .post('/api/restaurant-org/branches/foreign-restaurant/reactivate')
      .expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
    expect(restaurantOrg.reactivateRestaurantOrgBranch).not.toHaveBeenCalled()
  })

  it('POST /branches/:id/unlink rejects Branch Accounts outside the organization', async () => {
    restaurantOrg.userHasRestaurantOrgBranchAccess.mockResolvedValueOnce(false)
    const res = await request(app)
      .post('/api/restaurant-org/branches/foreign-restaurant/unlink')
      .send({ confirm: true })
      .expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
    expect(restaurantOrg.unlinkRestaurantFromOrganization).not.toHaveBeenCalled()
  })

  it('GET /reports/overview returns consolidated KPIs', async () => {
    const res = await request(app).get('/api/restaurant-org/reports/overview').expect(200)
    expect(restaurantOrgConsolidatedOverview).toHaveBeenCalled()
    expect(res.body.data.kpis.order_count).toBe(4)
  })

  it('GET /reports/comparison returns the authorized branch comparison', async () => {
    const res = await request(app).get('/api/restaurant-org/reports/comparison').expect(200)
    expect(restaurantOrgBranchComparison).toHaveBeenCalledWith('user-1', 'org-1', {})
    expect(res.body.data.coverage.foodCost.available).toBe(false)
  })

  it('GET /reports/demand-forecast returns cached branch-account forecasts', async () => {
    const res = await request(app).get('/api/restaurant-org/reports/demand-forecast').expect(200)
    expect(restaurantOrgBranchDemandForecast).toHaveBeenCalledWith('user-1', 'org-1', {})
    expect(res.body.data.coverage.scope).toBe('restaurant_account_aggregate_only')
  })

  it('GET /reports/demand-forecast rejects a non-forecast smart-reorder capability', async () => {
    getResolvedFeatureValue.mockResolvedValueOnce('suggestions_only')
    const res = await request(app).get('/api/restaurant-org/reports/demand-forecast').expect(403)
    expect(res.body.error.name).toBe('FEATURE_NOT_AVAILABLE')
    expect(restaurantOrgBranchDemandForecast).not.toHaveBeenCalled()
  })

  it('GET /reports/purchasing-insights returns read-only comparable price facts', async () => {
    const res = await request(app)
      .get('/api/restaurant-org/reports/purchasing-insights')
      .expect(200)
    expect(restaurantOrgCrossBranchPurchasingInsights).toHaveBeenCalledWith('user-1', 'org-1', {})
    expect(res.body.data.coverage.comparableOnly).toBe('same_product_and_supplier')
  })

  it('GET /reports/stock-transfer-suggestions returns suggestions only', async () => {
    await request(app).get('/api/restaurant-org/reports/stock-transfer-suggestions').expect(200)
    expect(restaurantOrgStockTransferSuggestions).toHaveBeenCalledWith('user-1', 'org-1', {})
  })

  it('GET /reports/advanced-analytics returns uncapped monthly trends', async () => {
    await request(app)
      .get('/api/restaurant-org/reports/advanced-analytics?from=2001-01-01&to=2026-01-01')
      .expect(200)
    expect(restaurantOrgAdvancedAnalytics).toHaveBeenCalled()
  })

  it('DELETE /users/:userId/branches/:restaurantId scopes revoke to the organization', async () => {
    const res = await request(app)
      .delete('/api/restaurant-org/users/user-2/branches/restaurant-2')
      .expect(200)
    expect(restaurantOrg.revokeRestaurantOrgBranchAccess).toHaveBeenCalledWith(
      'user-2',
      'restaurant-2',
      'org-1'
    )
    expect(res.body.data.revoked).toBe(true)
  })

  it('DELETE /users/:userId/branches/:restaurantId rejects a branch outside the organization', async () => {
    restaurantOrg.revokeRestaurantOrgBranchAccess.mockRejectedValueOnce(
      Object.assign(new Error('Branch is not part of this organization'), { code: 'NOT_FOUND' })
    )
    const res = await request(app)
      .delete('/api/restaurant-org/users/user-2/branches/foreign-restaurant')
      .expect(404)
    expect(res.body.error.name).toBe('NOT_FOUND')
  })

  it('POST /branches/:id/unlink passes the caller organization id', async () => {
    await request(app)
      .post('/api/restaurant-org/branches/restaurant-2/unlink')
      .send({ confirm: true })
      .expect(200)
    expect(restaurantOrg.unlinkRestaurantFromOrganization).toHaveBeenCalledWith('restaurant-2', {
      client: expect.anything(),
      organizationId: 'org-1',
    })
  })

  it('rejects an unscoped admin without impersonation', async () => {
    const adminApp = express()
    adminApp.use(express.json())
    adminApp.use((req, _res, next) => {
      req.requestId = 'test'
      req.userData = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }
      next()
    })
    adminApp.use('/api/restaurant-org', restaurantOrgRoutes)

    getEffectiveTenant.mockReturnValue(null)
    restaurantOrg.getUserRestaurantOrgMembership.mockResolvedValue(null)

    const res = await request(adminApp).get('/api/restaurant-org').expect(403)
    expect(res.body.error.message).toMatch(/Impersonate/)
  })

  it('rejects an impersonating admin querying another organization', async () => {
    const adminApp = express()
    adminApp.use(express.json())
    adminApp.use((req, _res, next) => {
      req.requestId = 'test'
      req.userData = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }
      next()
    })
    adminApp.use('/api/restaurant-org', restaurantOrgRoutes)

    getEffectiveTenant.mockReturnValueOnce({
      tenantId: 'restaurant-main',
      tenantType: 'RESTAURANT',
    })
    const res = await request(adminApp)
      .get('/api/restaurant-org?organization_id=org-foreign')
      .expect(400)
    expect(res.body.error.name).toBe('BAD_REQUEST')
  })

  it('binds impersonating admin restaurant org from the tenant, not leftover membership', async () => {
    const adminApp = express()
    adminApp.use(express.json())
    adminApp.use((req, _res, next) => {
      req.requestId = 'test'
      req.userData = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }
      next()
    })
    adminApp.use('/api/restaurant-org', restaurantOrgRoutes)

    getEffectiveTenant.mockReturnValue({
      tenantId: 'restaurant-main',
      tenantType: 'RESTAURANT',
    })
    restaurantOrg.getUserRestaurantOrgMembership.mockResolvedValue({
      organization_id: 'org-leftover',
      organization_name: 'Leftover Org',
      role_name: 'Org Owner',
    })
    queryMock.mockImplementation(async (sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('SELECT organization_id FROM restaurant WHERE id = $1')) {
        return { rows: [{ organization_id: 'org-impersonated' }] }
      }
      if (text.includes('SELECT name FROM restaurant_organizations WHERE id = $1')) {
        return { rows: [{ name: 'Impersonated Rest Org' }] }
      }
      if (
        text.includes('is_main_branch') ||
        text.includes('SELECT id FROM restaurant WHERE organization_id')
      ) {
        return { rows: [{ id: 'restaurant-main' }] }
      }
      return { rows: [] }
    })
    restaurantOrg.listRestaurantOrgBranches.mockResolvedValueOnce([
      { id: 'restaurant-main', name: 'Main', is_main_branch: true },
    ])

    const res = await request(adminApp).get('/api/restaurant-org').expect(200)
    expect(res.body.data.organization.id).toBe('org-impersonated')
    expect(res.body.data.organization.name).toBe('Impersonated Rest Org')
    expect(restaurantOrg.getUserRestaurantOrgMembership).not.toHaveBeenCalled()
  })

  it('POST /users/:userId/role returns 403 for non Org Owner', async () => {
    restaurantOrg.getUserRestaurantOrgMembership.mockResolvedValueOnce({
      organization_id: 'org-1',
      organization_name: 'Test Rest Org',
      role_name: 'Org Manager',
    })
    const res = await request(app)
      .post('/api/restaurant-org/users/user-2/role')
      .send({ roleName: 'Org Viewer' })
      .expect(403)
    expect(res.body.error.message).toMatch(/Org Owner/)
    expect(restaurantOrg.assignRestaurantOrgUserRole).not.toHaveBeenCalled()
  })
})
