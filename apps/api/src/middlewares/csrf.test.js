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

describe('csrfProtection — exempt prefixes only for non-cookie requests', () => {
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
    const ok = (_req, res) => res.json({ ok: true })
    app.post('/api/public/invitations/accept', ok)
    app.post('/api/public/reservations', ok)
    app.post('/auth/legal-acceptance', ok)
    app.post('/auth/refresh', ok)
    app.post('/auth/mobile/refresh', ok)
    app.patch('/auth/me/locale', ok)
    app.post('/webhooks/meta', ok)
  })

  it('rejects cookie-authenticated POST /api/public/invitations/accept without CSRF header', async () => {
    const res = await request(app)
      .post('/api/public/invitations/accept')
      .set('Cookie', 'access_token=cookie-jwt')
      .set('Origin', 'http://localhost:5173')
      .send({})

    expect(res.status).toBe(403)
    expect(res.body.error.name).toBe('CSRF_FORBIDDEN')
  })

  it('rejects cookie-authenticated public POST from a disallowed origin even with the header', async () => {
    const res = await request(app)
      .post('/api/public/invitations/accept')
      .set('Cookie', 'access_token=cookie-jwt')
      .set('Origin', 'http://evil.example.com')
      .set(CSRF_REQUEST_HEADER, CSRF_REQUEST_HEADER_VALUE)
      .send({})

    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('Origin not allowed')
  })

  it('allows cookie-authenticated public POST with header and allowed origin', async () => {
    const res = await request(app)
      .post('/api/public/invitations/accept')
      .set('Cookie', 'access_token=cookie-jwt')
      .set('Origin', 'http://localhost:5173')
      .set(CSRF_REQUEST_HEADER, CSRF_REQUEST_HEADER_VALUE)
      .send({})

    expect(res.status).toBe(200)
  })

  it('allows a Bearer-authenticated public POST without header or origin', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'user-1' })

    const res = await request(app)
      .post('/api/public/invitations/accept')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send({})

    expect(res.status).toBe(200)
  })

  it('allows an anonymous public POST (no session cookie)', async () => {
    const res = await request(app).post('/api/public/reservations').send({})

    expect(res.status).toBe(200)
  })

  it('treats an invalid Bearer on a public POST as anonymous, not a 401', async () => {
    verifyToken.mockRejectedValueOnce(new Error('invalid'))

    const res = await request(app)
      .post('/api/public/reservations')
      .set('Authorization', 'Bearer bad.token')
      .send({})

    expect(res.status).toBe(200)
  })

  it('allows webhooks without any CSRF header', async () => {
    const res = await request(app).post('/webhooks/meta').send({})

    expect(res.status).toBe(200)
  })

  it('rejects cookie-authenticated /auth writes without CSRF header', async () => {
    const legal = await request(app)
      .post('/auth/legal-acceptance')
      .set('Cookie', 'access_token=cookie-jwt')
      .send({})
    const locale = await request(app)
      .patch('/auth/me/locale')
      .set('Cookie', 'access_token=cookie-jwt')
      .send({})
    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refresh_token=refresh-jwt')
      .send({})

    expect(legal.status).toBe(403)
    expect(locale.status).toBe(403)
    expect(refresh.status).toBe(403)
  })

  it('allows cookie /auth/refresh with header and allowed origin', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refresh_token=refresh-jwt')
      .set('Origin', 'http://localhost:5173')
      .set(CSRF_REQUEST_HEADER, CSRF_REQUEST_HEADER_VALUE)
      .send({})

    expect(res.status).toBe(200)
  })

  it('keeps /auth/mobile/refresh exempt (refresh token travels in the body)', async () => {
    const res = await request(app)
      .post('/auth/mobile/refresh')
      .set('Cookie', 'access_token=stale-cookie')
      .send({ refresh_token: 'r' })

    expect(res.status).toBe(200)
  })
})
