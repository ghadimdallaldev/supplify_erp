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
  })
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
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
}))

vi.mock('../services/central-purchasing.service.js', () => ({
  assertCentralPurchasingEnabled: vi.fn().mockResolvedValue(true),
  listCentralPurchasingBranchAccounts: vi.fn().mockResolvedValue([]),
  getOrCreateCentralPurchasingDraft: vi.fn(),
  listCentralPurchasingDrafts: vi.fn().mockResolvedValue([]),
  updateCentralPurchasingDraftLines: vi.fn(),
  submitCentralPurchasingDrafts: vi.fn(),
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
import { restaurantOrgConsolidatedOverview } from '../services/org-reports.service.js'

describe('restaurant-org.routes', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    queryMock.mockReset()
    queryMock.mockImplementation(async (sql) => {
      const text = typeof sql === 'string' ? sql : ''
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

  it('POST /branches/:id/reactivate delegates to reactivateRestaurantOrgBranch', async () => {
    const res = await request(app)
      .post('/api/restaurant-org/branches/restaurant-2/reactivate')
      .expect(200)
    expect(restaurantOrg.reactivateRestaurantOrgBranch).toHaveBeenCalledWith('restaurant-2')
    expect(res.body.data.reactivated).toBe(true)
  })

  it('GET /reports/overview returns consolidated KPIs', async () => {
    const res = await request(app).get('/api/restaurant-org/reports/overview').expect(200)
    expect(restaurantOrgConsolidatedOverview).toHaveBeenCalled()
    expect(res.body.data.kpis.order_count).toBe(4)
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
