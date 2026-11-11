import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createPublicOrder = vi.fn()
const sendTemplateEmail = vi.fn()

vi.mock('../lib/rbac.js', () => ({
  optionalAuth: (req, _res, next) => {
    req.userData = null
    next()
  },
}))
vi.mock('../services/public-sales.service.js', () => ({
  previewPublicOrder: vi.fn(),
  createPublicOrder,
  getGuestPublicOrder: vi.fn(),
  listPublicSalesSuppliers: vi.fn(),
}))
vi.mock('./orders/orders.helpers.js', () => ({ scheduleOrderPlacedNotification: vi.fn() }))
vi.mock('../services/email/email.service.js', () => ({ sendTemplateEmail }))
vi.mock('../services/whatsapp.service.js', () => ({
  sendWhatsAppMessage: vi.fn(),
  isWhatsAppConfigured: vi.fn(() => false),
}))
vi.mock('../lib/app-url.js', () => ({ buildAppUrl: (path) => `https://app.example${path}` }))
vi.mock('../lib/rate-limit-store.js', () => ({ createRateLimitStore: vi.fn() }))
vi.mock('../lib/cache.js', () => ({ getRedisClient: () => null }))
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('../config/env.js', () => ({ config: { RATE_LIMIT_ENABLED: true } }))
vi.mock('../lib/feature-flags.js', () => ({ isPlatformFeatureEnabled: vi.fn(async () => false) }))

const productId = '11111111-1111-4111-8111-111111111111'
const body = (email) => ({
  items: [{ productId, quantity: 1 }],
  fulfillmentMethod: 'PICKUP',
  paymentMethod: 'CASH_ON_PICKUP',
  customer: { name: 'Guest User', phone: '+96170000000', ...(email ? { email } : {}) },
})

describe('public checkout abuse limits', () => {
  let app
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    let n = 0
    createPublicOrder.mockImplementation(async () => {
      n += 1
      return {
        order: {
          id: `o-${n}`,
          reference: `R-${n}`,
          customerType: 'GUEST',
          total: 1,
          currency: 'USD',
          customer: {},
          items: [{ supplierId: 's1' }],
        },
        trackingToken: 't'.repeat(43),
        replay: false,
        supplierName: 'S',
      }
    })
    app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use((req, _res, next) => {
      req.requestId = 'req'
      next()
    })
    const { publicSalesRoutes } = await import('./public-sales.routes.js')
    app.use('/api/public', publicSalesRoutes)
  })

  const place = (supplier, ip, email) =>
    request(app)
      .post(`/api/public/suppliers/${supplier}/orders`)
      .set('X-Forwarded-For', ip)
      .set('Idempotency-Key', `k-${Math.random()}`)
      .send(body(email))

  it('applies a global per-IP limit across different suppliers', async () => {
    for (let i = 0; i < 20; i += 1) {
      await place(`supplier-${i}`, '203.0.113.7').expect(201)
    }
    const res = await place('supplier-another', '203.0.113.7').expect(429)
    expect(res.body.error.name).toBe('RATE_LIMITED')
    // a different IP is unaffected
    await place('supplier-another', '203.0.113.8').expect(201)
  })

  it('caps outbound order emails per recipient even across IPs and suppliers', async () => {
    for (let i = 0; i < 5; i += 1) {
      await place(`supplier-${i}`, `198.51.100.${i + 1}`, 'victim@example.com').expect(201)
    }
    await new Promise((resolve) => setImmediate(resolve))
    expect(sendTemplateEmail).toHaveBeenCalledTimes(3)
  })
})
