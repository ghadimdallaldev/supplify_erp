import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockUser, mockSupplierUser, clearAllMocks } from '../test/helpers.js'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal)
})

vi.mock('../lib/plan-enforcement.js', () => ({
  checkLinkedAccountLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 3 }),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/linked-accounts.js', () => ({
  listLinkedAccounts: vi.fn().mockResolvedValue({
    primary: { id: 'restaurant-1', name: 'Main Restaurant', isPrimary: true },
    linked: [{ id: 'restaurant-2', name: 'Uptown', isPrimary: false }],
  }),
  createLinkedBranchAccount: vi.fn().mockResolvedValue({
    id: 'restaurant-3',
    name: 'Airport',
    slug: 'airport',
  }),
  removeLinkedBranchAccount: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/tenant-switch.js', () => ({
  canSwitchActiveTenant: vi.fn().mockResolvedValue(true),
  createActiveTenantToken: vi.fn().mockResolvedValue('signed-token'),
  getActiveTenantCookieName: () => 'active_tenant_token',
  getPrimaryTenantForUser: vi.fn().mockResolvedValue({
    tenantId: 'restaurant-1',
    tenantType: 'RESTAURANT',
    tenantName: 'Main Restaurant',
  }),
  userCanAccessTenant: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import branchesRoutes from './branches.routes.js'

describe('branches.routes (linked accounts)', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    queryMock.mockReset()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request'
      req.userData = { ...mockUser, email: 'owner@restaurant.com', role: 'RESTAURANT' }
      next()
    })
    app.use('/api/branches', branchesRoutes)
  })

  it('GET / returns primary and linked branch accounts', async () => {
    const response = await request(app).get('/api/branches').expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.primaryAccountId).toBe('restaurant-1')
    expect(response.body.data.accounts.length).toBeGreaterThanOrEqual(2)
  })

  it('POST / creates a linked branch account when plan allows', async () => {
    const linked = await import('../lib/linked-accounts.js')
    const response = await request(app)
      .post('/api/branches')
      .send({ name: 'Airport Branch', phone: '+96170000000' })
      .expect(201)

    expect(response.body.ok).toBe(true)
    expect(linked.createLinkedBranchAccount).toHaveBeenCalled()
    expect(response.body.data.account.name).toBe('Airport')
  })

  it('POST /switch sets active tenant cookie', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'restaurant-2', name: 'Uptown' }],
    })

    const response = await request(app)
      .post('/api/branches/switch')
      .send({ tenantId: 'restaurant-2', tenantType: 'RESTAURANT' })
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.activeAccountId).toBe('restaurant-2')
    expect(response.headers['set-cookie']?.[0]).toContain('active_tenant_token=')
    expect(response.body.data.activeTenantToken).toBeUndefined()
  })

  it('POST /switch returns the active tenant token to bearer clients', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'restaurant-2', name: 'Uptown' }],
    })

    const response = await request(app)
      .post('/api/branches/switch')
      .set('Authorization', 'Bearer mobile-access-token')
      .send({ tenantId: 'restaurant-2', tenantType: 'RESTAURANT' })
      .expect(200)

    expect(response.body.data.activeTenantToken).toBe('signed-token')
  })

  it('DELETE /:childTenantId unlinks a branch account', async () => {
    const response = await request(app).delete('/api/branches/restaurant-2').expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.removed).toBe(true)
  })
})
