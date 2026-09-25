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

import { consumerMenuAdminRoutes } from './menu.routes.js'

const FOREIGN_BRANCH = '11111111-1111-4111-8111-111111111111'

describe('Consumer menu admin branch ownership', () => {
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
        permissions: ['CATALOG_VIEW', 'CATALOG_EDIT'],
      }
      next()
    })
    app.use('/api/consumer/menu', consumerMenuAdminRoutes)
  })

  it('GET / rejects a branch that is not owned', async () => {
    const res = await request(app).get(`/api/consumer/menu?branchId=${FOREIGN_BRANCH}`)
    expect(res.status).toBe(400)
    expect(res.body.error?.message).toMatch(/Branch not found/i)
  })

  it('POST /categories rejects a branch that is not owned', async () => {
    const res = await request(app)
      .post('/api/consumer/menu/categories')
      .send({ name: 'Starters', branchId: FOREIGN_BRANCH })
    expect(res.status).toBe(400)
    expect(res.body.error?.message).toMatch(/Branch not found/i)
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO menu_category'))
    ).toBe(false)
  })

  it('POST /items rejects a branch that is not owned', async () => {
    const res = await request(app).post('/api/consumer/menu/items').send({
      categoryId: '22222222-2222-4222-8222-222222222222',
      name: 'Soup',
      basePrice: 8,
      branchId: FOREIGN_BRANCH,
    })
    expect(res.status).toBe(400)
    expect(res.body.error?.message).toMatch(/Branch not found/i)
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO menu_item'))).toBe(
      false
    )
  })

  it('POST /import rejects a branch that is not owned', async () => {
    const res = await request(app)
      .post('/api/consumer/menu/import')
      .send({ csv: 'category,name,price\nStarters,Soup,8.00', branchId: FOREIGN_BRANCH })
    expect(res.status).toBe(400)
    expect(res.body.error?.message).toMatch(/Branch not found/i)
  })
})
