import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return { query: queryMock, withTransaction: vi.fn(), pool: { query: queryMock } }
})

vi.mock('../lib/tenant-resolve.js', () => ({
  requireRestaurantId: vi.fn().mockResolvedValue('restaurant-1'),
  requireSupplierId: vi.fn().mockResolvedValue('supplier-1'),
}))

// Real requirePermission (the shared route mock stubs it out); only auth/tenant resolution is faked.
vi.mock('../lib/rbac.js', async (importOriginal) => {
  const actual = await importOriginal()
  const passthrough = (_req, _res, next) => next()
  return {
    ...actual,
    requireAuth: passthrough,
    resolveTenantContext: passthrough,
    requireRole: () => passthrough,
  }
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../services/disputes.service.js', () => ({
  createDispute: vi.fn(),
  listDisputesForRestaurant: vi.fn(),
  listIncomingDisputesForSupplier: vi.fn(),
  getDispute: vi.fn(),
  addDisputeAttachment: vi.fn(),
  cancelDispute: vi.fn(),
  reviewDispute: vi.fn(),
  rejectDispute: vi.fn(),
  resolveDispute: vi.fn(),
}))

import { disputesRoutes } from './disputes.routes.js'
import * as disputesService from '../services/disputes.service.js'

function buildApp(permissions, roles = ['Order Fulfillment Staff']) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.requestId = 'test-request-id'
    req.userData = { id: 'user-1', role: 'SUPPLIER' }
    req.tenantContext = { tenantId: 'supplier-1', tenantType: 'SUPPLIER', roles, permissions }
    next()
  })
  app.use('/api/disputes', disputesRoutes)
  return app
}

describe('POST /api/disputes/:id/resolve permission gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(disputesService.resolveDispute).mockResolvedValue({ id: 'd1' })
  })

  it('rejects credit_note resolution for fulfillment-only roles (money movement)', async () => {
    const app = buildApp(['FULFILLMENT_VIEW', 'FULFILLMENT_MANAGE', 'ORDERS_VIEW'])
    await request(app)
      .post('/api/disputes/d1/resolve')
      .send({ resolutionType: 'credit_note', creditNoteAmount: 10 })
      .expect(403)
    expect(disputesService.resolveDispute).not.toHaveBeenCalled()
  })

  it('rejects refund resolution for fulfillment-only roles', async () => {
    const app = buildApp(['FULFILLMENT_MANAGE'])
    await request(app)
      .post('/api/disputes/d1/resolve')
      .send({ resolutionType: 'refund', refundAmount: 10, refundReference: 'r1' })
      .expect(403)
    expect(disputesService.resolveDispute).not.toHaveBeenCalled()
  })

  it('allows credit_note resolution with INVOICES_MANAGE (Accountant)', async () => {
    const app = buildApp(['INVOICES_VIEW', 'INVOICES_MANAGE'], ['Accountant'])
    await request(app)
      .post('/api/disputes/d1/resolve')
      .send({ resolutionType: 'credit_note', creditNoteAmount: 10 })
      .expect(200)
    expect(disputesService.resolveDispute).toHaveBeenCalled()
  })

  it('allows credit_note resolution for the Owner role', async () => {
    const app = buildApp([], ['Owner'])
    await request(app)
      .post('/api/disputes/d1/resolve')
      .send({ resolutionType: 'credit_note', creditNoteAmount: 10 })
      .expect(200)
  })

  it('keeps FULFILLMENT_MANAGE enough for non-monetary resolutions', async () => {
    const app = buildApp(['FULFILLMENT_MANAGE'])
    await request(app)
      .post('/api/disputes/d1/resolve')
      .send({ resolutionType: 'no_action' })
      .expect(200)
  })

  it('rejects a non-monetary resolution without FULFILLMENT_MANAGE', async () => {
    const app = buildApp(['INVOICES_MANAGE'], ['Accountant'])
    await request(app)
      .post('/api/disputes/d1/resolve')
      .send({ resolutionType: 'no_action' })
      .expect(403)
  })
})
