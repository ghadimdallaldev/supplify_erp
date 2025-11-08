import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reservationsRoutes } from './reservations.routes.js'

const mockUser = {
  id: 'user-1',
  email: 'orders@goldenfork.com',
  role: 'RESTAURANT',
}

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => {
    req.userData = { ...mockUser }
    next()
  },
  requireRole: () => (req, res, next) => next(),
}))

const queryMock = vi.fn()
const withTransactionMock = vi.fn((handler) =>
  handler({
    query: (...args) => queryMock(...args),
  }),
)

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (handler) => withTransactionMock(handler),
}))

describe('reservations.routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request'
      next()
    })
    app.use('/api/reservations', reservationsRoutes)
  })

  it('returns reservation board data', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] }) // resolveRestaurantId
      .mockResolvedValueOnce({ rows: [] }) // fetchTables
      .mockResolvedValueOnce({ rows: [] }) // fetchReservations
      .mockResolvedValueOnce({ rows: [] }) // waitlist

    const response = await request(app).get('/api/reservations/board').expect(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.tables).toEqual([])
  })

  it('creates reservation with auto-confirm when utilisation low', async () => {
    mockUser.role = 'RESTAURANT'
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', capacity: 4, is_active: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'new-reservation',
            status: 'CONFIRMED',
            tables: ['t1'],
            customer_name: 'Test Guest',
            party_size: 2,
            scheduled_at: new Date().toISOString(),
            waitlist: false,
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    const response = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Test Guest',
        partySize: 2,
        scheduledAt: new Date().toISOString(),
      })
    expect(response.status).toBe(201)

    expect(response.body.data.reservation.status).toBe('CONFIRMED')
  })
})

