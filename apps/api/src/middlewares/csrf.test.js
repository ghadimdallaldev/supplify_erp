import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    NODE_ENV: 'development',
    WEB_ORIGINS: ['http://localhost:5173'],
  },
}))

vi.mock('../lib/auth.js', () => ({
  verifyToken: vi.fn(),
}))

import { csrfProtection, CSRF_REQUEST_HEADER, CSRF_REQUEST_HEADER_VALUE } from './csrf.js'

describe('csrfProtection — mobile bearer vs web cookie', () => {
  let app
  let verifyToken

  beforeEach(async () => {
    vi.clearAllMocks()
    verifyToken = (await import('../lib/auth.js')).verifyToken

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'csrf-test'
      next()
    })
    app.use(csrfProtection)
    app.post('/api/test-mutation', (_req, res) => {
      res.json({ ok: true, data: { saved: true } })
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('allows valid bearer mutations without CSRF header or origin', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'user-1' })

    const res = await request(app)
      .post('/api/test-mutation')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send({ foo: 'bar' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(verifyToken).toHaveBeenCalledWith('valid.jwt.token')
  })

  it('rejects invalid bearer with 401 (not CSRF 403)', async () => {
    verifyToken.mockRejectedValueOnce(new Error('invalid'))

    const res = await request(app)
      .post('/api/test-mutation')
      .set('Authorization', 'Bearer bad.token')
      .send({})

    expect(res.status).toBe(401)
    expect(res.body.error.name).toBe('UNAUTHORIZED')
  })

  it('requires CSRF header for cookie-based mutations', async () => {
    const res = await request(app)
      .post('/api/test-mutation')
      .set('Cookie', 'access_token=cookie-jwt')
      .set('Origin', 'http://localhost:5173')
      .send({})

    expect(res.status).toBe(403)
    expect(res.body.error.name).toBe('CSRF_FORBIDDEN')
    expect(res.body.error.message).toContain('CSRF protection header')
  })

  it('allows cookie mutations with CSRF header and allowed origin', async () => {
    const res = await request(app)
      .post('/api/test-mutation')
      .set('Cookie', 'access_token=cookie-jwt')
      .set('Origin', 'http://localhost:5173')
      .set(CSRF_REQUEST_HEADER, CSRF_REQUEST_HEADER_VALUE)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.data.saved).toBe(true)
  })

  it('rejects cookie mutations with CSRF header but disallowed origin', async () => {
    const res = await request(app)
      .post('/api/test-mutation')
      .set('Cookie', 'access_token=cookie-jwt')
      .set('Origin', 'http://evil.example.com')
      .set(CSRF_REQUEST_HEADER, CSRF_REQUEST_HEADER_VALUE)
      .send({})

    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('Origin not allowed')
  })
})
