import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockUser, clearAllMocks } from '../test/helpers.js'

const createRestaurantMemberInvitation = vi.fn()
const validateRestaurantRoleForBranch = vi.fn()

vi.mock('../lib/restaurant-invitations.js', () => ({
  createRestaurantMemberInvitation: (...args) => createRestaurantMemberInvitation(...args),
  createRestaurantBranchInvitation: vi.fn(),
  listRestaurantMemberInvitations: vi.fn().mockResolvedValue([]),
  listRestaurantBranchInvitations: vi.fn().mockResolvedValue([]),
  regenerateRestaurantInvitation: vi.fn(),
  revokeRestaurantInvitation: vi.fn(),
  validateRestaurantRoleForBranch: (...args) => validateRestaurantRoleForBranch(...args),
  assertRestaurantInOrg: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn().mockImplementation((sql) => {
    const text = String(sql)
    if (text.includes('organization_id FROM restaurant')) {
      return Promise.resolve({ rows: [{ organization_id: 'org-1' }] })
    }
    return Promise.resolve({ rows: [] })
  }),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'restaurant-1',
      tenantType: 'RESTAURANT',
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
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/restaurant-org.js', () => ({
  getUserRestaurantOrgMembership: vi.fn(),
}))

vi.mock('../lib/tenant-roles.js', () => ({
  ensureTenantSystemRoles: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import restaurantInvitationsRoutes from './restaurant-invitations.routes.js'

describe('restaurant-invitations.routes members', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    validateRestaurantRoleForBranch.mockResolvedValue(true)
    createRestaurantMemberInvitation.mockResolvedValue({
      invitation: { id: 'inv-1' },
      invite_url: 'http://localhost:5173/invite/restaurant?token=abc',
      expires_at: new Date().toISOString(),
    })

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = {
        tenantId: 'restaurant-1',
        tenantType: 'RESTAURANT',
        permissions: ['STAFF_INVITE'],
      }
      next()
    })
    app.use('/api/restaurants/invitations', restaurantInvitationsRoutes)
  })

  it('POST /members creates invitation when user has STAFF_INVITE', async () => {
    const res = await request(app)
      .post('/api/restaurants/invitations/members')
      .send({
        invited_email: 'member@example.com',
        role_id: 'role-viewer',
      })
      .expect(201)
    expect(res.body.data.invitation_id).toBe('inv-1')
    expect(createRestaurantMemberInvitation).toHaveBeenCalled()
  })

  it('POST /members returns 403 without invite permissions', async () => {
    const restricted = express()
    restricted.use(express.json())
    restricted.use((req, res, next) => {
      req.requestId = 'test'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = {
        tenantId: 'restaurant-1',
        tenantType: 'RESTAURANT',
        permissions: ['ORDERS_VIEW'],
      }
      next()
    })
    restricted.use('/api/restaurants/invitations', restaurantInvitationsRoutes)

    const res = await request(restricted)
      .post('/api/restaurants/invitations/members')
      .send({
        invited_email: 'member@example.com',
        role_id: 'role-viewer',
      })
      .expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
  })
})
