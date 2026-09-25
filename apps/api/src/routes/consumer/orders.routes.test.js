import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../../test/helpers.js'

vi.mock('../../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(),
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal)
})

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../lib/socket.js', () => ({
  emitConsumerOrderNew: vi.fn(),
}))

import { consumerOrdersAdminRoutes } from './orders.routes.js'
import { consumerFulfillmentAdminRoutes } from './fulfillment.routes.js'

const FOREIGN_BRANCH = '11111111-1111-4111-8111-111111111111'

describe('Consumer admin branch ownership', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    db.query.mockImplementation((sql) => {
      if (String(sql).includes('FROM branch')) {
        return Promise.resolve({ rows: [] })
      }
      return Promise.resolve({ rows: [] })
    })

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = {
        tenantId: 'restaurant-1',
        tenantType: 'RESTAURANT',
        permissions: ['ORDERS_VIEW', 'SETTINGS_VIEW'],
      }
      next()
    })
    app.use('/api/consumer/orders', consumerOrdersAdminRoutes)
    app.use('/api/consumer/fulfillment', consumerFulfillmentAdminRoutes)
  })

  it('GET /api/consumer/orders rejects a branch that is not owned', async () => {
    const res = await request(app).get(`/api/consumer/orders?branchId=${FOREIGN_BRANCH}`)
    expect(res.status).toBe(400)
    expect(res.body.error?.message).toMatch(/Branch not found/i)
  })

  it('GET /api/consumer/fulfillment rejects a branch that is not owned', async () => {
    const res = await request(app).get(`/api/consumer/fulfillment?branchId=${FOREIGN_BRANCH}`)
    expect(res.status).toBe(400)
    expect(res.body.error?.message).toMatch(/Branch not found/i)
  })
})
