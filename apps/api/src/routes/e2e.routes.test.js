import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ withTransaction: vi.fn() }))
vi.mock('../config/env.js', () => ({ config: { E2E_SECRET: 'e2e-secret-value' } }))
vi.mock('../lib/tenant-feature-gate.js', () => ({
  platformFeatureGate: () => (_req, _res, next) => next(),
}))

import { e2eRoutes } from './e2e.routes.js'
import { withTransaction } from '../lib/db.js'

describe('e2e routes secret guard', () => {
  let app
  beforeEach(() => {
    app = express()
    app.use(express.json())
    app.use('/api/e2e', e2eRoutes)
  })

  it('hides the routes (404) without the secret', async () => {
    await request(app).post('/api/e2e/reset-seed').send({}).expect(404)
  })

  it('hides the routes for a wrong secret of the same or a different length', async () => {
    await request(app)
      .post('/api/e2e/reset-seed')
      .set('x-e2e-secret', 'e2e-secret-valuX')
      .expect(404)
    await request(app).post('/api/e2e/reset-seed').set('x-e2e-secret', 'short').expect(404)
  })

  it('does not 404 for the correct secret', async () => {
    const res = await request(app)
      .post('/api/e2e/reset-seed')
      .set('x-e2e-secret', 'e2e-secret-value')
      .send({ scenario: 'bogus' })
    expect(res.status).not.toBe(404)
  })
})

describe('e2e catalog_basic seed', () => {
  it('files the seeded product under a leaf platform category', async () => {
    const calls = []
    const client = {
      query: vi.fn(async (sql, params) => {
        calls.push({ sql, params })
        if (/^\s*SELECT 1 FROM product/.test(sql)) return { rows: [] }
        if (/INSERT INTO product /.test(sql)) return { rows: [{ id: 'p-1' }] }
        return { rows: [] }
      }),
    }
    vi.mocked(withTransaction).mockImplementation(async (fn) => fn(client))
    const app = express()
    app.use(express.json())
    app.use('/api/e2e', e2eRoutes)

    await request(app)
      .post('/api/e2e/reset-seed')
      .set('x-e2e-secret', 'e2e-secret-value')
      .send({ scenario: 'catalog_basic', supplierId: 'sup-1' })
      .expect(200)

    const insert = calls.find((c) => /INSERT INTO product /.test(c.sql))
    expect(insert.sql).toMatch(/category_id/)
    // A platform leaf: no supplier owner and a parent department.
    expect(insert.sql).toMatch(/supplier_id IS NULL AND\s+parent_category_id IS NOT NULL/)
  })
})
