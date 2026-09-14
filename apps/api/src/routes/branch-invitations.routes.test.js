import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSupplierUser, clearAllMocks } from '../test/helpers.js'

const createBranchInvitation = vi.fn()
const listBranchInvitations = vi.fn()
const revokeBranchInvitation = vi.fn()
const regenerateBranchInvitation = vi.fn()
const assertSupplierInOrg = vi.fn()
const validateBranchRoleForSupplier = vi.fn()
const ensureSupplierOrganizationLinked = vi.fn()

vi.mock('../lib/branch-invitations.js', () => ({
  createBranchInvitation: (...args) => createBranchInvitation(...args),
  listBranchInvitations: (...args) => listBranchInvitations(...args),
  revokeBranchInvitation: (...args) => revokeBranchInvitation(...args),
  regenerateBranchInvitation: (...args) => regenerateBranchInvitation(...args),
  assertSupplierInOrg: (...args) => assertSupplierInOrg(...args),
  validateBranchRoleForSupplier: (...args) => validateBranchRoleForSupplier(...args),
}))

vi.mock('../lib/supplier-org.js', () => ({
  ensureSupplierOrganizationLinked: (...args) => ensureSupplierOrganizationLinked(...args),
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'branch-1',
      tenantType: 'SUPPLIER',
      permissions: ['STAFF_INVITE'],
    }
    next()
  },
  requireAnyPermission:
    (...keys) =>
    (req, res, next) => {
      const perms = req.tenantContext?.permissions || []
      if (keys.some((key) => perms.includes(key))) return next()
      return res.status(403).json({
        ok: false,
        error: { name: 'FORBIDDEN', message: `Missing one of: ${keys.join(', ')}` },
      })
    },
}))

vi.mock('../lib/subscription.js', () => ({
  // If team invites are ever re-gated on multi_branch, these route tests fail.
  requireFeature: (featureKey) => {
    if (featureKey === 'multi_branch') {
      return (req, res) =>
        res.status(403).json({
          ok: false,
          error: { name: 'FEATURE_NOT_AVAILABLE', message: 'multi_branch wrongly gated' },
        })
    }
    return (req, res, next) => next()
  },
}))

const ensureTenantSystemRoles = vi.fn().mockResolvedValue(undefined)

vi.mock('../lib/tenant-roles.js', () => ({
  ensureTenantSystemRoles: (...args) => ensureTenantSystemRoles(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { query } from '../lib/db.js'
import branchInvitationsRoutes from './branch-invitations.routes.js'

function defaultQueryMock(sql) {
  const text = String(sql)
  if (text.includes('organization_id FROM supplier') || text.includes('FROM supplier WHERE id')) {
    return Promise.resolve({
      rows: [{ organization_id: 'org-1', name: 'Acme Supply', slug: 'acme' }],
    })
  }
  if (text.includes('is_main_branch = true')) {
    return Promise.resolve({ rows: [{ id: 'supplier-main' }] })
  }
  return Promise.resolve({ rows: [] })
}

describe('branch-invitations.routes', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    createBranchInvitation.mockReset()
    listBranchInvitations.mockReset()
    revokeBranchInvitation.mockReset()
    regenerateBranchInvitation.mockReset()
    ensureTenantSystemRoles.mockClear()
    ensureSupplierOrganizationLinked.mockReset()
    ensureSupplierOrganizationLinked.mockResolvedValue({
      organizationId: 'org-1',
      created: false,
    })
    assertSupplierInOrg.mockResolvedValue(true)
    validateBranchRoleForSupplier.mockResolvedValue(true)
    query.mockReset()
    query.mockImplementation(defaultQueryMock)

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test'
      req.userData = { ...mockSupplierUser, id: 'user-1' }
      req.tenantContext = {
        tenantId: 'branch-1',
        tenantType: 'SUPPLIER',
        permissions: ['STAFF_INVITE'],
      }
      next()
    })
    app.use('/api/org/invitations', branchInvitationsRoutes)
  })

  it('POST / creates invitation without requiring multi_branch (driver invites on Growth)', async () => {
    createBranchInvitation.mockResolvedValue({
      invitation: { id: 'inv-driver' },
      invite_url: 'http://localhost:5173/invite/branch?token=driver',
      expires_at: new Date().toISOString(),
    })
    const res = await request(app)
      .post('/api/org/invitations')
      .send({
        supplier_id: 'branch-1',
        invited_name: 'Sam Driver',
        invited_email: 'driver@example.com',
        role_id: 'role-driver',
      })
      .expect(201)
    expect(res.body.data.invitation_id).toBe('inv-driver')
    expect(res.body.error).toBeNull()
  })

  it('auto-links a supplier organization when organization_id is missing', async () => {
    query.mockImplementation((sql) => {
      const text = String(sql)
      if (text.includes('FROM supplier WHERE id')) {
        return Promise.resolve({
          rows: [{ organization_id: null, name: 'Ghadi Preprod Supplier', slug: 'ghadi' }],
        })
      }
      if (text.includes('is_main_branch = true')) {
        return Promise.resolve({ rows: [{ id: 'branch-1' }] })
      }
      return Promise.resolve({ rows: [] })
    })
    ensureSupplierOrganizationLinked.mockResolvedValue({
      organizationId: 'org-created',
      created: true,
    })
    createBranchInvitation.mockResolvedValue({
      invitation: { id: 'inv-no-org' },
      invite_url: 'http://localhost:5173/invite/branch?token=x',
      expires_at: new Date().toISOString(),
    })

    const res = await request(app)
      .post('/api/org/invitations')
      .send({
        supplier_id: 'branch-1',
        invited_email: 'driver@example.com',
        role_id: 'role-driver',
      })
      .expect(201)

    expect(ensureSupplierOrganizationLinked).toHaveBeenCalledWith('branch-1')
    expect(res.body.data.invitation_id).toBe('inv-no-org')
  })

  it('GET /roles seeds system roles then lists inviteable roles', async () => {
    query.mockImplementation((sql) => {
      const text = String(sql)
      if (text.includes('FROM tenant_roles')) {
        return Promise.resolve({
          rows: [
            { id: 'role-driver', name: 'Driver', description: 'Deliveries' },
            { id: 'role-mgr', name: 'Manager', description: 'Ops' },
          ],
        })
      }
      return defaultQueryMock(sql)
    })

    const res = await request(app)
      .get('/api/org/invitations/roles?supplier_id=branch-1')
      .expect(200)
    expect(ensureTenantSystemRoles).toHaveBeenCalledWith('branch-1', 'SUPPLIER')
    expect(res.body.data.roles.map((r) => r.name)).toContain('Driver')
  })

  it('POST / creates invitation and returns invite_url', async () => {
    createBranchInvitation.mockResolvedValue({
      invitation: { id: 'inv-1' },
      invite_url: 'http://localhost:5173/invite/branch?token=abc',
      expires_at: new Date().toISOString(),
    })
    const res = await request(app)
      .post('/api/org/invitations')
      .send({
        supplier_id: 'branch-1',
        invited_name: 'Alex',
        invited_email: 'alex@example.com',
        role_id: 'role-1',
      })
      .expect(201)
    expect(res.body.data.invitation_id).toBe('inv-1')
    expect(res.body.data.invite_url).toContain('/invite/branch?token=')
  })

  it('POST / returns 403 when user lacks invite permissions', async () => {
    const restricted = express()
    restricted.use(express.json())
    restricted.use((req, res, next) => {
      req.requestId = 'test'
      req.userData = { ...mockSupplierUser, id: 'user-1' }
      req.tenantContext = {
        tenantId: 'branch-1',
        tenantType: 'SUPPLIER',
        permissions: ['ORDERS_VIEW'],
      }
      next()
    })
    restricted.use('/api/org/invitations', branchInvitationsRoutes)

    const res = await request(restricted)
      .post('/api/org/invitations')
      .send({
        supplier_id: 'branch-1',
        invited_email: 'alex@example.com',
        role_id: 'role-1',
      })
      .expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
  })

  it('GET / lists invitations', async () => {
    listBranchInvitations.mockResolvedValue([{ id: 'inv-1', status: 'pending' }])
    const res = await request(app).get('/api/org/invitations').expect(200)
    expect(res.body.data.invitations).toHaveLength(1)
  })

  it('DELETE /:id revokes invitation', async () => {
    revokeBranchInvitation.mockResolvedValue({ id: 'inv-1' })
    await request(app).delete('/api/org/invitations/inv-1').expect(200)
    expect(revokeBranchInvitation).toHaveBeenCalledWith('inv-1', 'org-1')
  })

  it('POST /:id/regenerate returns new invite_url', async () => {
    regenerateBranchInvitation.mockResolvedValue({
      invitation: { id: 'inv-1' },
      invite_url: 'http://localhost:5173/invite/branch?token=new',
      expires_at: new Date().toISOString(),
    })
    const res = await request(app).post('/api/org/invitations/inv-1/regenerate').expect(200)
    expect(res.body.data.invite_url).toContain('token=new')
  })

  it('POST / returns WORKSPACE_MEMBERSHIP_CONFLICT with 409', async () => {
    const err = new Error('This user is already linked to another account')
    err.name = 'WORKSPACE_MEMBERSHIP_CONFLICT'
    err.status = 409
    createBranchInvitation.mockRejectedValue(err)

    const res = await request(app)
      .post('/api/org/invitations')
      .send({
        supplier_id: 'branch-1',
        invited_email: 'taken@example.com',
        role_id: 'role-driver',
      })
      .expect(409)
    expect(res.body.error.name).toBe('WORKSPACE_MEMBERSHIP_CONFLICT')
    expect(res.body.error.message).toMatch(/already linked/i)
  })
})
