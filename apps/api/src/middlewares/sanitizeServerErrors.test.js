import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { sanitizeServerErrors } from './sanitizeServerErrors.js'

function buildApp({ expose }) {
  const app = express()
  app.use((req, _res, next) => {
    req.requestId = 'req-1'
    next()
  })
  app.use(sanitizeServerErrors({ expose }))
  app.get('/leak500', (req, res) =>
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'relation "orders" does not exist',
        details: 'SELECT * FROM customer_order WHERE secret = 1',
        stack: 'Error: boom\n at x',
      },
      requestId: req.requestId,
    })
  )
  app.get('/ok503', (req, res) =>
    res.status(503).json({
      ok: false,
      data: null,
      error: {
        name: 'AUTH_TEMPORARILY_UNAVAILABLE',
        message: 'Retry shortly.',
        details: 'redis down',
      },
      requestId: req.requestId,
    })
  )
  app.get('/bad400', (req, res) =>
    res.status(400).json({
      ok: false,
      data: null,
      error: {
        name: 'VALIDATION_ERROR',
        message: 'Quantity must be positive',
        details: { field: 'qty' },
      },
      requestId: req.requestId,
    })
  )
  app.get('/404', (req, res) =>
    res.status(404).json({ ok: false, error: { name: 'NOT_FOUND', message: 'Order not found' } })
  )
  app.get('/data', (req, res) => res.status(200).json({ ok: true, data: { message: 'fine' } }))
  app.get('/array500', (req, res) => res.status(500).json([{ message: 'x' }]))
  return app
}

describe('sanitizeServerErrors', () => {
  it('strips message/details/stack from 500 bodies outside dev but keeps name and requestId', async () => {
    const res = await request(buildApp({ expose: false }))
      .get('/leak500')
      .expect(500)
    expect(res.body.error).toEqual({ name: 'INTERNAL_ERROR', message: 'Internal server error' })
    expect(res.body.requestId).toBe('req-1')
    expect(res.body.ok).toBe(false)
    expect(JSON.stringify(res.body)).not.toMatch(/relation|SELECT|stack|boom/)
  })

  it('keeps curated 503 messages but still strips details', async () => {
    const res = await request(buildApp({ expose: false }))
      .get('/ok503')
      .expect(503)
    expect(res.body.error.message).toBe('Retry shortly.')
    expect(res.body.error.details).toBeUndefined()
    expect(res.body.error.name).toBe('AUTH_TEMPORARILY_UNAVAILABLE')
  })

  it('leaves 4xx and 2xx bodies untouched', async () => {
    const app = buildApp({ expose: false })
    const bad = await request(app).get('/bad400').expect(400)
    expect(bad.body.error.message).toBe('Quantity must be positive')
    expect(bad.body.error.details).toEqual({ field: 'qty' })
    const nf = await request(app).get('/404').expect(404)
    expect(nf.body.error.message).toBe('Order not found')
    const ok = await request(app).get('/data').expect(200)
    expect(ok.body.data.message).toBe('fine')
  })

  it('passes non-object 5xx bodies through', async () => {
    const res = await request(buildApp({ expose: false }))
      .get('/array500')
      .expect(500)
    expect(res.body).toEqual([{ message: 'x' }])
  })

  it('exposes everything in dev', async () => {
    const res = await request(buildApp({ expose: true }))
      .get('/leak500')
      .expect(500)
    expect(res.body.error.message).toBe('relation "orders" does not exist')
    expect(res.body.error.details).toMatch(/SELECT/)
  })
})
