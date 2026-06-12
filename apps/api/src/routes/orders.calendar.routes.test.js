import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ordersCalendarRoutes } from './orders.calendar.routes.js'

const mockUser = {
  id: 'user-1',
  email: 'orders@goldenfork.com',
  role: 'RESTAURANT',
}

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal)
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

const queryMock = vi.fn()
const getCacheMock = vi.fn()
const setCacheMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: vi.fn((...args) => queryMock(...args)),
}))

vi.mock('../lib/cache.js', () => ({
  getCache: (...args) => getCacheMock(...args),
  setCache: (...args) => setCacheMock(...args),
}))

describe('orders.calendar.routes', () => {
  let app

  beforeEach(async () => {
    queryMock.mockReset()
    getCacheMock.mockReset()
    setCacheMock.mockReset()
    mockUser.role = 'RESTAURANT'
    mockUser.email = 'orders@goldenfork.com'

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser }
      next()
    })
    app.use('/api/orders/calendar', ordersCalendarRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  it('returns calendar events for restaurant users with derived filters', async () => {
    mockUser.role = 'RESTAURANT'
    getCacheMock.mockResolvedValue(null)

    queryMock
      // Query 1: Check if branch_id column exists (tenant from getRequestTenant mock)
      .mockResolvedValueOnce({
        rows: [{ exists: true }],
      })
      // Query 2: Get orders
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'order-1',
            status: 'DELIVERED',
            total_amount: '120.50',
            currency: 'USD',
            placed_at: '2025-05-01T10:00:00.000Z',
            created_at: '2025-05-01T09:55:00.000Z',
            updated_at: '2025-05-02T09:00:00.000Z',
            branch_id: 'branch-1',
            branch_name: 'Dubai Marina',
            restaurant_id: 'restaurant-1',
            restaurant_name: 'Golden Fork Restaurant',
            suppliers: [{ id: 'supplier-1', name: 'Fresh Foods Co.' }],
            categories: ['Vegetables', 'Oils'],
          },
        ],
      })
      // Query 4: Get order count
      .mockResolvedValueOnce({
        rows: [{ count: '1' }],
      })
      // Query 5: Get invoices
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'invoice-1',
            order_id: 'order-1',
            invoice_date: '2025-05-02',
            due_date: '2025-05-15',
            total_amount: '120.50',
            currency: 'USD',
            status: 'ISSUED',
            supplier_id: 'supplier-1',
            restaurant_id: 'restaurant-1',
            created_at: '2025-05-02T12:00:00.000Z',
            supplier_name: 'Fresh Foods Co.',
            restaurant_name: 'Golden Fork Restaurant',
          },
        ],
      })

    const response = await request(app).get('/api/orders/calendar').expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.events).toHaveLength(2)
    expect(response.body.data.filters.statuses).toEqual(
      expect.arrayContaining(['DELIVERED', 'ISSUED'])
    )
    expect(response.body.data.filters.suppliers).toContainEqual({
      id: 'supplier-1',
      name: 'Fresh Foods Co.',
    })
    expect(response.body.data.events[0].role).toBe('RESTAURANT')
    expect(setCacheMock).toHaveBeenCalledWith(
      expect.stringContaining('orders-calendar'),
      expect.any(Object),
      300
    )
  })

  it('returns cached payload when available', async () => {
    mockUser.role = 'RESTAURANT'
    mockUser.email = 'orders@goldenfork.com'

    const cachedData = {
      tenant: { id: 'restaurant-1', role: 'RESTAURANT' },
      events: [],
      pagination: { page: 1, pageSize: 100, total: 0 },
      filters: { statuses: [], suppliers: [], branches: [], categories: [] },
    }

    // Tenant from getRequestTenant mock; branch column check is first query
    queryMock.mockResolvedValueOnce({
      rows: [{ exists: true }],
    })

    // Mock cache to return data
    getCacheMock.mockResolvedValue(cachedData)

    const response = await request(app).get('/api/orders/calendar').expect(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data).toEqual(cachedData)
    expect(setCacheMock).not.toHaveBeenCalled()
    // With getRequestTenant mocked, only branch column check runs before cache
    expect(queryMock).toHaveBeenCalledTimes(1)
  })

  it('filters events by status for supplier users', async () => {
    const rbac = await import('../lib/rbac.js')
    vi.mocked(rbac.getRequestTenant).mockResolvedValueOnce({
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      tenantName: 'Fresh Foods Co.',
    })

    mockUser.role = 'SUPPLIER'
    mockUser.email = 'contact@freshfoods.com'
    getCacheMock.mockResolvedValue(null)

    queryMock
      // Query 1: Check if branch_id column exists (tenant from getRequestTenant mock)
      .mockResolvedValueOnce({
        rows: [{ exists: true }],
      })
      // Query 2: Get orders
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'order-2',
            status: 'PROCESSING',
            total_amount: '80.00',
            currency: 'USD',
            placed_at: '2025-05-05T08:00:00.000Z',
            created_at: '2025-05-05T07:50:00.000Z',
            updated_at: '2025-05-06T10:00:00.000Z',
            branch_id: null,
            branch_name: null,
            restaurant_id: 'restaurant-1',
            restaurant_name: 'Golden Fork Restaurant',
            suppliers: [{ id: 'supplier-1', name: 'Fresh Foods Co.' }],
            categories: ['Meat'],
          },
        ],
      })
      // Query 3: Get order count
      .mockResolvedValueOnce({
        rows: [{ count: '1' }],
      })
      // Query 4: Get invoices
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'invoice-2',
            order_id: 'order-2',
            invoice_date: '2025-05-06',
            due_date: '2025-05-20',
            total_amount: '80.00',
            currency: 'USD',
            status: 'ISSUED',
            supplier_id: 'supplier-1',
            restaurant_id: 'restaurant-1',
            created_at: '2025-05-06T11:00:00.000Z',
            supplier_name: 'Fresh Foods Co.',
            restaurant_name: 'Golden Fork Restaurant',
          },
        ],
      })

    const response = await request(app)
      .get('/api/orders/calendar')
      .query({ status: 'ISSUED' })
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.events).toHaveLength(1)
    expect(response.body.data.events[0].status).toBe('ISSUED')
    expect(response.body.data.events[0].role).toBe('SUPPLIER')
    expect(response.body.data.filters.suppliers).toContainEqual({
      id: 'restaurant-1',
      name: 'Golden Fork Restaurant',
    })
  })
})
