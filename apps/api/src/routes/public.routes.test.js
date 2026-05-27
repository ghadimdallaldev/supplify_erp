import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publicRoutes } from './public.routes.js'

const VALID_TOKEN = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'
const RESTAURANT_ID = '33333333-3333-3333-3333-333333333333'
const TIME_ENTRY_ID = '44444444-4444-4444-4444-444444444444'

const queryMock = vi.fn()
vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))
vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('../services/staff-portal-mail.service.js', () => ({
  sendStaffPortalMagicLink: vi.fn().mockResolvedValue({ delivered: true }),
}))
vi.mock('../services/mailer.service.js', () => ({
  isEmailConfigured: vi.fn().mockReturnValue(true),
}))

describe('POST /api/public/staff/request-link', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request'
      next()
    })
    app.use('/api/public', publicRoutes)
  })

  it('returns generic message when staff email is unknown', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const res = await request(app)
      .post('/api/public/staff/request-link')
      .send({ email: 'unknown@example.com' })
      .expect(200)
    expect(res.body.data.message).toMatch(/sign-in link has been sent/i)
    expect(res.body.data.sessionToken).toBeUndefined()
  })

  it('creates session and sends magic link when staff exists', async () => {
    const { sendStaffPortalMagicLink } = await import('../services/staff-portal-mail.service.js')
    queryMock.mockResolvedValueOnce({
      rows: [{ id: STAFF_ID, display_name: 'Jane', restaurant_id: RESTAURANT_ID }],
    })
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          session_token: VALID_TOKEN,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      ],
    })
    const res = await request(app)
      .post('/api/public/staff/request-link')
      .send({ email: 'jane@example.com' })
      .expect(200)
    expect(sendStaffPortalMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        sessionToken: VALID_TOKEN,
      })
    )
    expect(res.body.data.message).toMatch(/sign-in link has been sent/i)
  })
})

describe('public.routes – staff portal time entries', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request'
      next()
    })
    app.use('/api/public', publicRoutes)
  })

  function mockStaffSession() {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          staff_id: STAFF_ID,
          restaurant_id: RESTAURANT_ID,
          session_token: VALID_TOKEN,
          expires_at: new Date(Date.now() + 86400000),
        },
      ],
    })
  }

  describe('GET /api/public/staff/time-entries', () => {
    it('returns 400 when token is missing', async () => {
      const res = await request(app).get('/api/public/staff/time-entries').expect(400)
      expect(res.body.ok).toBe(false)
    })

    it('returns 401 when session is invalid', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] })
      const res = await request(app)
        .get('/api/public/staff/time-entries')
        .query({ token: VALID_TOKEN })
        .expect(401)
      expect(res.body.ok).toBe(false)
      expect(res.body.error?.name).toBe('INVALID_SESSION')
    })

    it('returns time entries for valid token', async () => {
      mockStaffSession()
      const clockInAt = new Date().toISOString()
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: TIME_ENTRY_ID,
            restaurant_id: RESTAURANT_ID,
            staff_id: STAFF_ID,
            clock_in_at: clockInAt,
            clock_out_at: null,
            clock_in_method: 'portal',
            clock_out_method: null,
            break_minutes: 0,
            note: null,
            status: 'OPEN',
            staff_name: 'Jane Doe',
            staff_role: 'Server',
            created_at: clockInAt,
            updated_at: clockInAt,
          },
        ],
      })
      const res = await request(app)
        .get('/api/public/staff/time-entries')
        .query({ token: VALID_TOKEN })
        .expect(200)
      expect(res.body.ok).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].id).toBe(TIME_ENTRY_ID)
      expect(res.body.data[0].clockInAt).toBe(clockInAt)
      expect(res.body.data[0].clockOutAt).toBeNull()
      expect(res.body.data[0].staff?.name).toBe('Jane Doe')
    })
  })

  describe('POST /api/public/staff/check-in', () => {
    it('returns 401 when session is invalid', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] })
      const res = await request(app)
        .post('/api/public/staff/check-in')
        .send({ token: VALID_TOKEN })
        .expect(401)
      expect(res.body.error?.name).toBe('INVALID_SESSION')
    })

    it('returns 409 when staff already has open time entry', async () => {
      mockStaffSession()
      queryMock.mockResolvedValueOnce({ rows: [{ id: TIME_ENTRY_ID }] })
      const res = await request(app)
        .post('/api/public/staff/check-in')
        .send({ token: VALID_TOKEN })
        .expect(409)
      expect(res.body.error?.name).toBe('TIME_ENTRY_OPEN_EXISTS')
    })

    it('creates time entry and returns 201', async () => {
      mockStaffSession()
      queryMock.mockResolvedValueOnce({ rows: [] })
      const clockInAt = new Date().toISOString()
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: TIME_ENTRY_ID,
            restaurant_id: RESTAURANT_ID,
            staff_id: STAFF_ID,
            clock_in_at: clockInAt,
            clock_out_at: null,
            clock_in_method: 'portal',
            clock_out_method: null,
            break_minutes: 0,
            note: null,
            status: 'OPEN',
            created_at: clockInAt,
            updated_at: clockInAt,
          },
        ],
      })
      queryMock.mockResolvedValueOnce({
        rows: [{ staff_name: 'Jane Doe', staff_role: 'Server' }],
      })
      const res = await request(app)
        .post('/api/public/staff/check-in')
        .send({ token: VALID_TOKEN })
        .expect(201)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.id).toBe(TIME_ENTRY_ID)
      expect(res.body.data.clockInMethod).toBe('portal')
      expect(res.body.data.clockOutAt).toBeNull()
    })
  })

  describe('POST /api/public/staff/time-entries/:id/check-out', () => {
    it('returns 401 when session is invalid', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] })
      const res = await request(app)
        .post(`/api/public/staff/time-entries/${TIME_ENTRY_ID}/check-out`)
        .send({ token: VALID_TOKEN })
        .expect(401)
      expect(res.body.error?.name).toBe('INVALID_SESSION')
    })

    it('returns 404 when time entry not found or already closed', async () => {
      mockStaffSession()
      queryMock.mockResolvedValueOnce({ rows: [] })
      const res = await request(app)
        .post(`/api/public/staff/time-entries/${TIME_ENTRY_ID}/check-out`)
        .send({ token: VALID_TOKEN })
        .expect(404)
      expect(res.body.error?.name).toBe('TIME_ENTRY_NOT_FOUND')
    })

    it('closes time entry and returns 200', async () => {
      mockStaffSession()
      const clockOutAt = new Date().toISOString()
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: TIME_ENTRY_ID,
            restaurant_id: RESTAURANT_ID,
            staff_id: STAFF_ID,
            clock_in_at: new Date(Date.now() - 3600000).toISOString(),
            clock_out_at: clockOutAt,
            clock_in_method: 'portal',
            clock_out_method: 'portal',
            break_minutes: 0,
            note: null,
            status: 'OPEN',
            staff_name: 'Jane Doe',
            staff_role: 'Server',
            created_at: new Date().toISOString(),
            updated_at: clockOutAt,
          },
        ],
      })
      queryMock.mockResolvedValueOnce({
        rows: [{ staff_name: 'Jane Doe', staff_role: 'Server' }],
      })
      const res = await request(app)
        .post(`/api/public/staff/time-entries/${TIME_ENTRY_ID}/check-out`)
        .send({ token: VALID_TOKEN })
        .expect(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.clockOutAt).toBe(clockOutAt)
      expect(res.body.data.clockOutMethod).toBe('portal')
    })
  })
})
