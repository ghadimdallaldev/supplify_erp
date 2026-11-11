import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ withTransaction: vi.fn() }))
vi.mock('../config/env.js', () => ({ config: { E2E_SECRET: 'e2e-secret-value' } }))

import { e2eRoutes } from './e2e.routes.js'

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
