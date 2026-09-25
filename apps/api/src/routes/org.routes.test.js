import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSupplierUser, clearAllMocks } from '../test/helpers.js'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: async (fn) => fn({ query: (...args) => queryMock(...args) }),
}))

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-main'),
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

vi.mock('../lib/impersonation.js', () => ({
  getEffectiveTenant: vi.fn(() => null),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/plan-enforcement.js', () => ({
  checkLinkedAccountLimit: vi.fn().mockResolvedValue({ allowed: true }),
  createAuditLog: vi.fn(),
}))

vi.mock('../lib/supplier-org.js', () => ({
  getUserOrgMembership: vi.fn().mockResolvedValue({
    organization_id: 'org-1',
    organization_name: 'Test Org',
    role_name: 'Org Owner',
  }),
  listOrgBranchesForUser: vi.fn().mockResolvedValue([
    { id: 'supplier-main', name: 'Main', is_main_branch: true, staff_count: 2, order_count: 5 },
    { id: 'supplier-2', name: 'North', is_main_branch: false, staff_count: 1, order_count: 2 },
  ]),
  createOrgBranch: vi.fn().mockResolvedValue({ id: 'supplier-3', name: 'East' }),
  deactivateOrgBranch: vi.fn(),
  reactivateOrgBranch: vi.fn().mockResolvedValue({ ok: true, organizationId: 'org-1' }),
  unlinkSupplierFromOrganization: vi.fn().mockResolvedValue({ ok: true, organizationId: 'org-1' }),
  userHasOrgBranchAccess: vi.fn().mockResolvedValue(true),
  assignOrgUserRole: vi.fn(),
  grantOrgBranchAccess: vi.fn(),
  revokeOrgBranchAccess: vi.fn(),
  ensureOrgAccessForBranchStaff: vi.fn(),
  invalidateOrgPermissionCaches: vi.fn(),
  listOrgBranches: vi.fn().mockResolvedValue([]),
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
  supplierOrgConsolidatedOverview: vi.fn().mockResolvedValue({
    data: {
      kpis: { order_count: 3, total_revenue: 100, active_branch_accounts: 2 },
      by_branch: [],
    },
    meta: {},
  }),
}))

vi.mock('../lib/permissions.js', () => ({
  invalidateUserPermissionCache: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: async (fn) => fn({ query: (...args) => queryMock(...args) }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../config/env.js', () => ({
  config: { NODE_ENV: 'test' },
}))

import orgRoutes from './org.routes.js'
import * as supplierOrg from '../lib/supplier-org.js'
import { supplierOrgConsolidatedOverview } from '../services/org-reports.service.js'
import { getEffectiveTenant } from '../lib/impersonation.js'

describe('org.routes', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    getEffectiveTenant.mockReturnValue(null)
    supplierOrg.getUserOrgMembership.mockReset()
    supplierOrg.getUserOrgMembership.mockResolvedValue({
      organization_id: 'org-1',
      organization_name: 'Test Org',
      role_name: 'Org Owner',
    })
    queryMock.mockReset()
    queryMock.mockImplementation(async (sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('SELECT organization_id FROM supplier WHERE id = $1')) {
        return { rows: [{ organization_id: 'org-1' }] }
      }
      if (text.includes('SELECT name FROM organization WHERE id = $1')) {
        return { rows: [{ name: 'Test Org' }] }
      }
      if (text.includes('is_main_branch')) {
        return { rows: [{ id: 'supplier-main' }] }
      }
      if (text.includes('SELECT id, name, is_branch_active FROM supplier WHERE id = $1')) {
        return { rows: [{ id: 'supplier-2', name: 'North', is_branch_active: true }] }
      }
      if (text.includes('SELECT id, name FROM supplier WHERE id = $1')) {
        return { rows: [{ id: 'supplier-2', name: 'North' }] }
      }
      if (text.includes('SELECT id FROM supplier WHERE organization_id')) {
        return { rows: [{ id: 'supplier-main' }] }
      }
      if (text.includes('SELECT * FROM supplier WHERE id = $1')) {
        return { rows: [{ id: 'supplier-main', name: 'Main', is_main_branch: true }] }
      }
      return { rows: [] }
    })
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test'
      req.userData = { ...mockSupplierUser, id: 'user-1', email: 'owner@supplier.com' }
      next()
    })
    app.use('/api/org', orgRoutes)
  })

  it('GET / returns organization and branches', async () => {
    const res = await request(app).get('/api/org').expect(200)
    expect(res.body.data.organization.id).toBe('org-1')
    expect(res.body.data.branches).toHaveLength(2)
  })

  it('GET /branches lists branches with stats', async () => {
    const res = await request(app).get('/api/org/branches').expect(200)
    expect(res.body.data.branches).toHaveLength(2)
  })

  it('POST /branches creates branch for Org Owner', async () => {
    const res = await request(app)
      .post('/api/org/branches')
      .send({ name: 'East Branch' })
      .expect(201)
    expect(supplierOrg.createOrgBranch).toHaveBeenCalled()
    expect(res.body.data.branch.name).toBe('East')
  })

  it('POST /context/switch sets cookie', async () => {
    const res = await request(app)
      .post('/api/org/context/switch')
      .send({ supplier_id: 'supplier-2' })
      .expect(200)
    expect(res.body.data.activeSupplierId).toBe('supplier-2')
    expect(res.headers['set-cookie']?.[0]).toContain('active_tenant_token=')
  })

  it('DELETE /branches/:id delegates to deactivateOrgBranch', async () => {
    supplierOrg.deactivateOrgBranch.mockResolvedValueOnce({ ok: false, reason: 'MAIN_BRANCH' })
    const res = await request(app).delete('/api/org/branches/supplier-main').expect(403)
    expect(res.body.error.name).toBe('MAIN_BRANCH')
  })

  it('DELETE /branches/:id rejects Branch Accounts outside the organization', async () => {
    supplierOrg.userHasOrgBranchAccess.mockResolvedValueOnce(false)
    const res = await request(app).delete('/api/org/branches/foreign-supplier').expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
    expect(supplierOrg.deactivateOrgBranch).not.toHaveBeenCalled()
  })

  it('POST /branches/:id/reactivate delegates to reactivateOrgBranch', async () => {
    const res = await request(app).post('/api/org/branches/supplier-2/reactivate').expect(200)
    expect(supplierOrg.reactivateOrgBranch).toHaveBeenCalledWith('supplier-2', 'org-1')
    expect(res.body.data.reactivated).toBe(true)
  })

  it('POST /branches/:id/reactivate rejects Branch Accounts outside the organization', async () => {
    supplierOrg.userHasOrgBranchAccess.mockResolvedValueOnce(false)
    const res = await request(app).post('/api/org/branches/foreign-supplier/reactivate').expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
    expect(supplierOrg.reactivateOrgBranch).not.toHaveBeenCalled()
  })

  it('POST /branches/:id/unlink rejects Branch Accounts outside the organization', async () => {
    supplierOrg.userHasOrgBranchAccess.mockResolvedValueOnce(false)
    const res = await request(app)
      .post('/api/org/branches/foreign-supplier/unlink')
      .send({ confirm: true })
      .expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
    expect(supplierOrg.unlinkSupplierFromOrganization).not.toHaveBeenCalled()
  })

  it('GET /reports/overview returns consolidated KPIs', async () => {
    const res = await request(app).get('/api/org/reports/overview').expect(200)
    expect(supplierOrgConsolidatedOverview).toHaveBeenCalled()
    expect(res.body.data.kpis.order_count).toBe(3)
  })

  it('DELETE /users/:userId/branches/:supplierId scopes revoke to the organization', async () => {
    const res = await request(app).delete('/api/org/users/user-2/branches/supplier-2').expect(200)
    expect(supplierOrg.revokeOrgBranchAccess).toHaveBeenCalledWith('user-2', 'supplier-2', 'org-1')
    expect(res.body.data.revoked).toBe(true)
  })

  it('DELETE /users/:userId/branches/:supplierId rejects a branch outside the organization', async () => {
    supplierOrg.revokeOrgBranchAccess.mockRejectedValueOnce(
      Object.assign(new Error('Branch is not part of this organization'), { code: 'NOT_FOUND' })
    )
    const res = await request(app)
      .delete('/api/org/users/user-2/branches/foreign-supplier')
      .expect(404)
    expect(res.body.error.name).toBe('NOT_FOUND')
    expect(supplierOrg.revokeOrgBranchAccess).toHaveBeenCalledWith(
      'user-2',
      'foreign-supplier',
      'org-1'
    )
  })

  it('POST /branches/:id/unlink passes the caller organization id', async () => {
    await request(app)
      .post('/api/org/branches/supplier-2/unlink')
      .send({ confirm: true })
      .expect(200)
    expect(supplierOrg.unlinkSupplierFromOrganization).toHaveBeenCalledWith('supplier-2', {
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
    adminApp.use('/api/org', orgRoutes)

    getEffectiveTenant.mockReturnValue(null)
    supplierOrg.getUserOrgMembership.mockResolvedValue(null)

    const res = await request(adminApp).get('/api/org').expect(403)
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
    adminApp.use('/api/org', orgRoutes)

    getEffectiveTenant.mockReturnValueOnce({
      tenantId: 'supplier-main',
      tenantType: 'SUPPLIER',
    })
    const res = await request(adminApp).get('/api/org?organization_id=org-foreign').expect(400)
    expect(res.body.error.name).toBe('BAD_REQUEST')
  })

  it('binds impersonating admin org from the tenant, not leftover membership', async () => {
    const adminApp = express()
    adminApp.use(express.json())
    adminApp.use((req, _res, next) => {
      req.requestId = 'test'
      req.userData = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }
      next()
    })
    adminApp.use('/api/org', orgRoutes)

    getEffectiveTenant.mockReturnValue({
      tenantId: 'supplier-main',
      tenantType: 'SUPPLIER',
    })
    supplierOrg.getUserOrgMembership.mockResolvedValue({
      organization_id: 'org-leftover',
      organization_name: 'Leftover Org',
      role_name: 'Org Owner',
    })
    queryMock.mockImplementation(async (sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('SELECT organization_id FROM supplier WHERE id = $1')) {
        return { rows: [{ organization_id: 'org-impersonated' }] }
      }
      if (text.includes('SELECT name FROM organization WHERE id = $1')) {
        return { rows: [{ name: 'Impersonated Org' }] }
      }
      if (
        text.includes('is_main_branch') ||
        text.includes('SELECT id FROM supplier WHERE organization_id')
      ) {
        return { rows: [{ id: 'supplier-main' }] }
      }
      return { rows: [] }
    })
    supplierOrg.listOrgBranches.mockResolvedValueOnce([
      { id: 'supplier-main', name: 'Main', is_main_branch: true },
    ])

    const res = await request(adminApp).get('/api/org').expect(200)
    expect(res.body.data.organization.id).toBe('org-impersonated')
    expect(res.body.data.organization.name).toBe('Impersonated Org')
    expect(supplierOrg.getUserOrgMembership).not.toHaveBeenCalled()
  })

  it('POST /users/:userId/role returns 403 for non Org Owner', async () => {
    supplierOrg.getUserOrgMembership.mockResolvedValueOnce({
      organization_id: 'org-1',
      organization_name: 'Test Org',
      role_name: 'Org Manager',
    })
    const res = await request(app)
      .post('/api/org/users/user-2/role')
      .send({ roleName: 'Org Viewer' })
      .expect(403)
    expect(res.body.error.message).toMatch(/Org Owner/)
    expect(supplierOrg.assignOrgUserRole).not.toHaveBeenCalled()
  })
})
