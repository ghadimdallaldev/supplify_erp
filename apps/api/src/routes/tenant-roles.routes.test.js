import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(async (fn) => fn({ query: queryMock })),
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

const isFeatureEnabled = vi.fn().mockResolvedValue(true)
const ensureTenantSystemRoles = vi.fn().mockResolvedValue(undefined)
const assignTenantUserRole = vi.fn().mockResolvedValue(undefined)
const assertCanAssignRole = vi.fn().mockResolvedValue({ id: 'role-1', name: 'Manager' })
const assertCanGrantPermissions = vi.fn()

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser, id: 'owner-user', role: 'RESTAURANT' }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      permissions: ['SETTINGS_VIEW', 'SETTINGS_MANAGE'],
    }
    next()
  },
  requirePermission: (key) => (req, res, next) => {
    const perms = req.tenantContext?.permissions || []
    if (!perms.includes(key) && !perms.includes('SETTINGS_MANAGE')) {
      return res.status(403).json({ ok: false, error: { name: 'FORBIDDEN' } })
    }
    next()
  },
  requireAnyPermission:
    (...keys) =>
    (req, res, next) => {
      const perms = req.tenantContext?.permissions || []
      if (keys.some((key) => perms.includes(key))) return next()
      return res.status(403).json({ ok: false, error: { name: 'FORBIDDEN' } })
    },
  getRequestTenant: vi.fn(),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  isFeatureEnabled: (...args) => isFeatureEnabled(...args),
}))

vi.mock('../lib/tenant-roles.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ensureTenantSystemRoles: (...args) => ensureTenantSystemRoles(...args),
    assignTenantUserRole: (...args) => assignTenantUserRole(...args),
    RESERVED_SYSTEM_ROLE_NAMES: actual.RESERVED_SYSTEM_ROLE_NAMES,
    getAllPermissionsForTenantType: actual.getAllPermissionsForTenantType,
  }
})

vi.mock('../lib/workspace-membership.js', () => ({
  resolveWorkspaceScope: vi.fn().mockResolvedValue({
    workspaceType: 'RESTAURANT',
    organizationId: 'org-1',
    homeTenantId: 'tenant-1',
  }),
  MAIN_ADMIN_ROLE_NAME: 'Owner',
}))

vi.mock('../lib/rbac-guards.js', () => ({
  assertCanAssignRole: (...args) => assertCanAssignRole(...args),
  assertCanGrantPermissions: (...args) => assertCanGrantPermissions(...args),
}))

vi.mock('../lib/access-cache.js', () => ({
  invalidateUserAuthCaches: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/permissions.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    invalidateUserPermissionCache: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { tenantRolesRoutes } from './tenant-roles.routes.js'

describe('Tenant roles routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    isFeatureEnabled.mockResolvedValue(true)

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { id: 'owner-user', role: 'RESTAURANT', email: 'o@example.com' }
      req.tenantContext = {
        tenantId: 'tenant-1',
        tenantType: 'RESTAURANT',
        permissions: ['SETTINGS_VIEW', 'SETTINGS_MANAGE', 'ORDERS_MANAGE'],
      }
      next()
    })
    app.use('/api/roles', tenantRolesRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  it('GET / returns roles for tenant', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          name: 'Owner',
          is_system: true,
          permissions: ['ORDERS_VIEW'],
          user_count: 1,
        },
      ],
    })
    const res = await request(app).get('/api/roles').expect(200)
    expect(res.body.data.roles).toHaveLength(1)
  })

  it('POST / creates custom role', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'new-role', name: 'Custom', is_system: false }] })
      .mockResolvedValue({ rows: [] })
    const res = await request(app)
      .post('/api/roles')
      .send({ name: 'Custom', permissions: ['ORDERS_VIEW', 'ORDERS_CREATE'] })
      .expect(201)
    expect(res.body.data.role.name).toBe('Custom')
  })

  it('POST / rejects removed or invalid permission keys', async () => {
    const res = await request(app)
      .post('/api/roles')
      .send({ name: 'Bad Perms', permissions: ['approvals_budgets', 'ORDERS_VIEW'] })
      .expect(400)
    expect(res.body.error.message).toMatch(/Invalid permissions/)
    expect(res.body.error.message).toContain('approvals_budgets')
  })

  it('PATCH / updates custom role permissions in DB', async () => {
    db.query.mockImplementation((sql) => {
      const text = String(sql)
      if (text.includes('FROM tenant_roles WHERE id')) {
        return {
          rows: [
            {
              id: 'r-custom',
              name: 'Custom',
              is_system: false,
              tenant_id: 'tenant-1',
              tenant_type: 'RESTAURANT',
            },
          ],
        }
      }
      if (text.includes('DELETE FROM tenant_role_permissions')) {
        return { rows: [] }
      }
      if (text.includes('INSERT INTO tenant_role_permissions')) {
        return { rows: [] }
      }
      if (text.includes('FROM tenant_user_roles WHERE role_id')) {
        return { rows: [{ user_id: 'u-assign' }] }
      }
      if (text.includes('FROM tenant_roles tr WHERE tr.id')) {
        return {
          rows: [
            {
              id: 'r-custom',
              name: 'Custom',
              is_system: false,
              permissions: ['ORDERS_VIEW', 'INVOICES_VIEW'],
            },
          ],
        }
      }
      return { rows: [] }
    })
    const res = await request(app)
      .patch('/api/roles/r-custom')
      .send({ permissions: ['ORDERS_VIEW', 'INVOICES_VIEW'] })
      .expect(200)
    expect(res.body.data.role.permissions).toContain('INVOICES_VIEW')
    const deleteCalls = db.query.mock.calls.filter((c) =>
      String(c[0]).includes('DELETE FROM tenant_role_permissions')
    )
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('PATCH / blocks system role permission changes', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'r-owner',
          name: 'Owner',
          is_system: true,
          tenant_id: 'tenant-1',
          tenant_type: 'RESTAURANT',
        },
      ],
    })
    const res = await request(app)
      .patch('/api/roles/r-owner')
      .send({ permissions: ['ORDERS_VIEW'] })
      .expect(400)
    expect(res.body.error.message).toMatch(/cannot be modified/)
  })

  it('DELETE system role is rejected', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          name: 'Owner',
          is_system: true,
          tenant_id: 'tenant-1',
          tenant_type: 'RESTAURANT',
        },
      ],
    })
    const res = await request(app).delete('/api/roles/r1').expect(400)
    expect(res.body.error.message).toMatch(/Owner role cannot be deleted/)
  })

  it('DELETE role with users returns user list', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'r2',
            name: 'Custom',
            is_system: false,
            tenant_id: 'tenant-1',
            tenant_type: 'RESTAURANT',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'u2', email: 'u2@example.com', display_name: 'User 2' }],
      })
    const res = await request(app).delete('/api/roles/r2').expect(409)
    expect(res.body.error.name).toBe('ROLE_IN_USE')
    expect(res.body.data.users).toHaveLength(1)
  })

  it('POST assign Owner requires owner requester', async () => {
    const { ForbiddenError } = await import('../middlewares/errorHandler.js')
    assertCanAssignRole.mockRejectedValueOnce(
      new ForbiddenError('Only an Owner can assign the Owner role')
    )
    const ownerRoleId = 'a0000001-0001-4000-8000-000000000099'
    const res = await request(app)
      .post('/api/roles/users/a0000001-0001-4000-8000-000000000088/assign')
      .send({ role_id: ownerRoleId })
      .expect(403)
    expect(res.body.error.message).toMatch(/Owner/)
  })

  it('assign role calls service and invalidates auth caches', async () => {
    const mgrRoleId = 'a0000001-0001-4000-8000-000000000098'
    assertCanAssignRole.mockResolvedValueOnce({
      id: mgrRoleId,
      name: 'Manager',
      tenant_id: 'tenant-1',
      tenant_type: 'RESTAURANT',
    })
    const targetUserId = 'a0000001-0001-4000-8000-000000000088'
    const res = await request(app)
      .post(`/api/roles/users/${targetUserId}/assign`)
      .send({ role_id: mgrRoleId })
      .expect(200)
    expect(assignTenantUserRole).toHaveBeenCalled()
    expect(res.body.data.roleName).toBe('Manager')
    const { invalidateUserAuthCaches } = await import('../lib/access-cache.js')
    expect(invalidateUserAuthCaches).toHaveBeenCalledWith({
      userId: targetUserId,
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
    })
  })

  it('POST assign allows STAFF_INVITE without SETTINGS_MANAGE', async () => {
    const viewerRoleId = 'a0000001-0001-4000-8000-000000000097'
    assertCanAssignRole.mockResolvedValueOnce({
      id: viewerRoleId,
      name: 'Viewer',
      tenant_id: 'tenant-1',
      tenant_type: 'RESTAURANT',
    })
    const inviteOnlyApp = express()
    inviteOnlyApp.use(express.json())
    inviteOnlyApp.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { id: 'inviter-user', role: 'RESTAURANT', email: 'inv@example.com' }
      req.tenantContext = {
        tenantId: 'tenant-1',
        tenantType: 'RESTAURANT',
        permissions: ['STAFF_VIEW', 'STAFF_INVITE', 'ORDERS_VIEW'],
      }
      next()
    })
    inviteOnlyApp.use('/api/roles', tenantRolesRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    inviteOnlyApp.use(errorHandler)

    const res = await request(inviteOnlyApp)
      .post('/api/roles/users/a0000001-0001-4000-8000-000000000088/assign')
      .send({ role_id: viewerRoleId })
      .expect(200)
    expect(res.body.data.roleName).toBe('Viewer')
  })
})

describe('Tenant roles feature flag', () => {
  it('isFeatureEnabled can be mocked off', async () => {
    isFeatureEnabled.mockResolvedValueOnce(false)
    expect(await isFeatureEnabled('tenant-1', 'RESTAURANT', 'advanced_roles')).toBe(false)
  })
})
