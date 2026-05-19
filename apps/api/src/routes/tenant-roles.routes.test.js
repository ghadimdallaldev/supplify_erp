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
const userHasOwnerRole = vi.fn().mockResolvedValue(true)

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
    userHasOwnerRole: (...args) => userHasOwnerRole(...args),
    RESERVED_SYSTEM_ROLE_NAMES: actual.RESERVED_SYSTEM_ROLE_NAMES,
    getAllPermissionsForTenantType: actual.getAllPermissionsForTenantType,
  }
})

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
    expect(res.body.error.message).toMatch(/System roles/)
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
    userHasOwnerRole.mockResolvedValueOnce(false)
    const ownerRoleId = 'a0000001-0001-4000-8000-000000000099'
    db.query.mockResolvedValueOnce({
      rows: [{ id: ownerRoleId, name: 'Owner', tenant_id: 'tenant-1', tenant_type: 'RESTAURANT' }],
    })
    const res = await request(app)
      .post('/api/roles/users/a0000001-0001-4000-8000-000000000088/assign')
      .send({ role_id: ownerRoleId })
      .expect(403)
    expect(res.body.error.message).toMatch(/Owner/)
  })

  it('assign role calls service and invalidates cache', async () => {
    userHasOwnerRole.mockResolvedValue(true)
    const mgrRoleId = 'a0000001-0001-4000-8000-000000000098'
    db.query.mockResolvedValueOnce({
      rows: [{ id: mgrRoleId, name: 'Manager', tenant_id: 'tenant-1', tenant_type: 'RESTAURANT' }],
    })
    const res = await request(app)
      .post('/api/roles/users/a0000001-0001-4000-8000-000000000088/assign')
      .send({ role_id: mgrRoleId })
      .expect(200)
    expect(assignTenantUserRole).toHaveBeenCalled()
    expect(res.body.data.roleName).toBe('Manager')
  })
})

describe('Tenant roles feature flag', () => {
  it('isFeatureEnabled can be mocked off', async () => {
    isFeatureEnabled.mockResolvedValueOnce(false)
    expect(await isFeatureEnabled('tenant-1', 'RESTAURANT', 'advanced_roles')).toBe(false)
  })
})
