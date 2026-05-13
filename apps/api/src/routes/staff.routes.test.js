import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { staffRoutes } from './staff.routes.js'

const mockUser = {
  id: 'user-1',
  email: 'restaurant@supplify.com',
  role: 'RESTAURANT',
}

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => {
    req.userData = { ...mockUser }
    next()
  },
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}))

vi.mock('../lib/tenant.js', () => ({
  getRestaurantIdByEmail: vi.fn().mockResolvedValue('rest-1'),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyStaffPtoRequest: vi.fn(),
  notifyStaffSwapRequest: vi.fn(),
}))

const queryMock = vi.fn()
vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

describe('staff.routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request'
      next()
    })
    app.use('/api/staff', staffRoutes)
  })

  it('GET /members returns staff directory', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'staff-1',
          restaurant_id: 'rest-1',
          status: 'ACTIVE',
          first_name: 'Alex',
          last_name: 'Rivera',
          display_name: 'Alex R.',
          email: 'alex@example.com',
          phone: null,
          role: 'Server',
          wage_type: 'HOURLY',
          wage_rate: '18.50',
          hire_date: '2025-01-01',
          profile_color: '#3366ff',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
      ],
    })

    const res = await request(app).get('/api/staff/members').expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].firstName).toBe('Alex')
    expect(res.body.data[0].role).toBe('Server')
  })

  it('GET /shifts returns scheduled shifts', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'shift-1',
          restaurant_id: 'rest-1',
          staff_id: 'staff-1',
          role: 'Server',
          shift_date: '2026-05-14',
          starts_at: '2026-05-14T09:00:00.000Z',
          ends_at: '2026-05-14T17:00:00.000Z',
          status: 'PUBLISHED',
          notes: null,
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
          staff_name: 'Alex R.',
          staff_role: 'Server',
        },
      ],
    })

    const res = await request(app)
      .get('/api/staff/shifts?startDate=2026-05-14&endDate=2026-05-20')
      .expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data[0].status).toBe('PUBLISHED')
    expect(res.body.data[0].staff.name).toBe('Alex R.')
  })
})
