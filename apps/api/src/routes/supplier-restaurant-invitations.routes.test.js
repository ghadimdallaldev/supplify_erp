import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSupplierRestaurantInvitation = vi.fn()
const listSupplierRestaurantInvitations = vi.fn()

vi.mock('../lib/supplier-restaurant-invitations.js', () => ({
  createSupplierRestaurantInvitation: (...args) => createSupplierRestaurantInvitation(...args),
  listSupplierRestaurantInvitations: (...args) => listSupplierRestaurantInvitations(...args),
  revokeSupplierRestaurantInvitation: vi.fn(),
}))

vi.mock('../config/supplifyModel.js', () => ({
  isSupplifyV2: vi.fn(),
  isSupplifyV1: vi.fn(() => false),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => {
    req.userData = { id: 'user-1' }
    next()
  },
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = { tenantId: 'supplier-1', tenantType: 'SUPPLIER' }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import supplierRestaurantInvitationsRoutes from './supplier-restaurant-invitations.routes.js'
import { isSupplifyV2 } from '../config/supplifyModel.js'

describe('supplier-restaurant-invitations.routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/api/supplier/restaurant-invitations', supplierRestaurantInvitationsRoutes)
  })

  it('returns v2Required when listing on V1', async () => {
    isSupplifyV2.mockReturnValue(false)
    listSupplierRestaurantInvitations.mockResolvedValue([])
    const res = await request(app).get('/api/supplier/restaurant-invitations').expect(200)
    expect(res.body.data.v2Required).toBe(true)
    expect(listSupplierRestaurantInvitations).not.toHaveBeenCalled()
  })

  it('creates invitation when V2', async () => {
    isSupplifyV2.mockReturnValue(true)
    createSupplierRestaurantInvitation.mockResolvedValue({
      invitation: { id: 'inv-1' },
      invite_url: 'http://localhost:5173/invite?token=abc&type=sr',
      expires_at: new Date().toISOString(),
    })
    const res = await request(app)
      .post('/api/supplier/restaurant-invitations')
      .send({ invited_email: 'buyer@restaurant.com', invited_name: 'Chef' })
      .expect(201)
    expect(res.body.ok).toBe(true)
    expect(createSupplierRestaurantInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'supplier-1',
        invitedEmail: 'buyer@restaurant.com',
      })
    )
  })

  it('rejects create on V1', async () => {
    isSupplifyV2.mockReturnValue(false)
    const res = await request(app)
      .post('/api/supplier/restaurant-invitations')
      .send({ invited_email: 'buyer@restaurant.com' })
      .expect(403)
    expect(res.body.error.name).toBe('V2_REQUIRED')
  })
})
