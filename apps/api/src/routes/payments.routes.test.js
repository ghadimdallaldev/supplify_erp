import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

// Mock db before importing routes
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const withTransactionMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: withTransactionMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
    __withTransactionMock: withTransactionMock,
  }
})

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal)
})

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import routes after mocks
import { paymentsRoutes } from './payments.routes.js'

describe('Payments Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()

    // Sync db mocks
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    vi.mocked(dbModule.withTransaction).mockImplementation((...args) => db.withTransaction(...args))

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser, role: 'SUPPLIER', email: 'supplier@example.com' }
      next()
    })
    app.use('/api/payments', paymentsRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/payments/invoice/:invoiceId', () => {
    it('should return list of payments for invoice', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ supplier_id: 'supplier-1' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'payment-1',
              invoice_id: 'invoice-1',
              amount: 100.5,
              payment_method: 'CASH',
              payment_date: new Date(),
            },
          ],
        })

      const response = await request(app).get('/api/payments/invoice/invoice-1').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.payments).toHaveLength(1)
    })
  })

  describe('POST /api/payments', () => {
    it('should create a payment', async () => {
      const invoiceId = '00000000-0000-0000-0000-000000000001'
      const invoice = {
        id: invoiceId,
        restaurant_id: 'restaurant-1',
        supplier_id: 'supplier-1',
        total_amount: 100.5,
        balance_due: 100.5,
        currency: 'USD',
      }

      db.query.mockResolvedValueOnce({ rows: [invoice] })

      db.withTransaction.mockImplementation(async (handler) => {
        const client = {
          query: vi
            .fn()
            .mockResolvedValueOnce({ rows: [invoice] })
            .mockResolvedValueOnce({ rows: [{ total_paid: 0 }] })
            .mockResolvedValueOnce({ rows: [{ payment_number: 'PAY-TEST-001' }] })
            .mockResolvedValueOnce({
              rows: [
                {
                  id: 'payment-1',
                  invoice_id: invoiceId,
                  payment_amount: 100.5,
                  payment_method: 'CASH',
                  payment_number: 'PAY-TEST-001',
                  status: 'COMPLETED',
                },
              ],
            })
            .mockResolvedValueOnce({ rows: [{ ...invoice, balance_due: 0, status: 'PAID' }] }),
        }
        return handler(client)
      })

      const response = await request(app)
        .post('/api/payments')
        .send({
          invoice_id: invoiceId,
          payment_amount: 100.5,
          payment_method: 'CASH',
          payment_date: new Date().toISOString().split('T')[0],
        })
        .expect(201)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.payment.payment_amount).toBe(100.5)
    })
  })
})
