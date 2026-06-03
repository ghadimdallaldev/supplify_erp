import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(async (fn) => fn({ query: queryMock })),
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = {
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
      permissions: ['RECEIVING_VIEW'],
    }
    req.userData = { id: 'user-1', email: 'owner@resto.com', role: 'RESTAURANT' }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('rest-1'),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { receivingRoutes } from './receiving.routes.js'

describe('receiving.routes pending-orders', () => {
  let app
  let db

  beforeEach(async () => {
    const mod = await import('../lib/db.js')
    db = mod
    db.query.mockReset()
    app = express()
    app.use((req, res, next) => {
      req.requestId = 'test'
      next()
    })
    app.use('/api/receiving', receivingRoutes)
  })

  it('includes DELIVERED orders in pending query', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'order-delivered' }] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await request(app).get('/api/receiving/pending-orders').expect(200)

    expect(res.body.data.orders).toHaveLength(1)
    const sql = db.query.mock.calls[0][0]
    const params = db.query.mock.calls[0][1]
    expect(sql).toMatch(/status::text = ANY/)
    expect(params[1]).toContain('DELIVERED')
    expect(params[1]).toContain('COMPLETED')
  })
})

describe('receiving.routes pending-orders/supplier', () => {
  let app
  let db

  beforeEach(async () => {
    const mod = await import('../lib/db.js')
    db = mod
    db.query.mockReset()
    app = express()
    app.use((req, res, next) => {
      req.requestId = 'test'
      req.userData = { id: 'user-s', email: 'supplier@test.com', role: 'SUPPLIER' }
      next()
    })
    app.use('/api/receiving', receivingRoutes)
  })

  it('includes DELIVERED and legacy COMPLETED in supplier pending query', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'sup-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-legacy' }] })

    const res = await request(app).get('/api/receiving/pending-orders/supplier').expect(200)

    expect(res.body.data.orders).toHaveLength(1)
    const params = db.query.mock.calls[1][1]
    expect(params[1]).toContain('DELIVERED')
    expect(params[1]).toContain('COMPLETED')
  })
})
