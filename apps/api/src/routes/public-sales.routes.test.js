import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const previewPublicOrder = vi.fn()
const createPublicOrder = vi.fn()
const getGuestPublicOrder = vi.fn()
const listPublicSalesSuppliers = vi.fn()

vi.mock('../lib/rbac.js', () => ({
  optionalAuth: (req, _res, next) => {
    const role = req.get('x-test-role')
    req.userData = role ? { id: 'user-1', role } : null
    next()
  },
}))
vi.mock('../services/public-sales.service.js', () => ({
  previewPublicOrder,
  createPublicOrder,
  getGuestPublicOrder,
  listPublicSalesSuppliers,
}))
vi.mock('./orders/orders.helpers.js', () => ({ scheduleOrderPlacedNotification: vi.fn() }))
vi.mock('../services/email/email.service.js', () => ({ sendTemplateEmail: vi.fn() }))
vi.mock('../services/whatsapp.service.js', () => ({
  sendWhatsAppMessage: vi.fn(),
  isWhatsAppConfigured: vi.fn(() => false),
}))
vi.mock('../lib/app-url.js', () => ({ buildAppUrl: (path) => `https://app.example${path}` }))
vi.mock('../lib/rate-limit-store.js', () => ({ createRateLimitStore: vi.fn() }))
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn() } }))
vi.mock('../config/env.js', () => ({ config: { RATE_LIMIT_ENABLED: false } }))
vi.mock('../lib/feature-flags.js', () => ({
  isPlatformFeatureEnabled: vi.fn(async () => false),
}))

const supplier = 'public-supplier'
const productId = '11111111-1111-4111-8111-111111111111'
const checkout = {
  items: [{ productId, quantity: 2 }],
  fulfillmentMethod: 'PICKUP',
  paymentMethod: 'CASH_ON_PICKUP',
}
const order = {
  id: 'order-1',
  reference: 'ORD-ORDER-1',
  customerType: 'GUEST',
  status: 'PLACED',
  total: 20,
  currency: 'USD',
  items: [{ supplierId: 'supplier-1' }],
}

describe('public sales routes', () => {
  let app
  beforeEach(async () => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.requestId = 'req-public-sales'
      next()
    })
    const { publicSalesRoutes } = await import('./public-sales.routes.js')
    app.use('/api/public', publicSalesRoutes)
  })

  it('previews through authoritative server validation without authentication', async () => {
    previewPublicOrder.mockResolvedValue({
      ...checkout,
      supplierId: 'supplier-1',
      supplierName: 'Supplier',
      subtotal: 20,
      deliveryFee: 0,
      total: 20,
      currency: 'USD',
      items: [{ productId, name: 'Item', quantity: 2, unitPrice: 10, lineTotal: 20 }],
    })
    const res = await request(app)
      .post(`/api/public/suppliers/${supplier}/orders/preview`)
      .send(checkout)
      .expect(200)
    expect(res.body.data.total).toBe(20)
    expect(previewPublicOrder).toHaveBeenCalledWith(supplier, checkout)
  })

  it('rejects oversized public checkout bodies before business validation', async () => {
    const res = await request(app)
      .post(`/api/public/suppliers/${supplier}/orders/preview`)
      .send({ ...checkout, ignored: 'x'.repeat(65 * 1024) })
      .expect(413)
    expect(res.body.error.name).toBe('PAYLOAD_TOO_LARGE')
    expect(previewPublicOrder).not.toHaveBeenCalled()
  })

  it('requires an idempotency key before guest placement', async () => {
    const res = await request(app)
      .post(`/api/public/suppliers/${supplier}/orders`)
      .send({ ...checkout, customer: { name: 'Guest User', phone: '+96170000000' } })
      .expect(400)
    expect(res.body.error.name).toBe('INVALID_IDEMPOTENCY_KEY')
    expect(createPublicOrder).not.toHaveBeenCalled()
  })

  it('classifies unauthenticated placement as guest', async () => {
    createPublicOrder.mockResolvedValue({ order, trackingToken: 'a'.repeat(43), replay: false })
    const res = await request(app)
      .post(`/api/public/suppliers/${supplier}/orders`)
      .set('Idempotency-Key', 'attempt-1')
      .send({ ...checkout, customer: { name: 'Guest User', phone: '+96170000000' } })
      .expect(201)
    expect(res.body.data.trackingToken).toHaveLength(43)
    expect(createPublicOrder).toHaveBeenCalledWith(
      expect.objectContaining({ actor: null, idempotencyKey: 'attempt-1' })
    )
  })

  it('uses the same placement endpoint for an authenticated consumer', async () => {
    createPublicOrder.mockResolvedValue({
      order: { ...order, customerType: 'CONSUMER' },
      trackingToken: null,
      replay: false,
    })
    await request(app)
      .post(`/api/public/suppliers/${supplier}/orders`)
      .set('x-test-role', 'CONSUMER')
      .set('Idempotency-Key', 'attempt-2')
      .send({ ...checkout, customer: { name: 'Consumer User', phone: '+96170000000' } })
      .expect(201)
    expect(createPublicOrder).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { id: 'user-1', role: 'CONSUMER' } })
    )
  })

  it('rejects authenticated business roles from the public checkout', async () => {
    await request(app)
      .post(`/api/public/suppliers/${supplier}/orders`)
      .set('x-test-role', 'RESTAURANT')
      .set('Idempotency-Key', 'attempt-3')
      .send({ ...checkout, customer: { name: 'Business User', phone: '+96170000000' } })
      .expect(403)
    expect(createPublicOrder).not.toHaveBeenCalled()
  })

  it('returns only the restricted token projection', async () => {
    getGuestPublicOrder.mockResolvedValue(order)
    const token = 'b'.repeat(43)
    const res = await request(app).get(`/api/public/orders/${token}`).expect(200)
    expect(res.body.data).toEqual(order)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('exposes mobile_public_shop from the platform feature flag', async () => {
    const { isPlatformFeatureEnabled } = await import('../lib/feature-flags.js')
    isPlatformFeatureEnabled.mockResolvedValueOnce(true)
    const res = await request(app).get('/api/public/features').expect(200)
    expect(res.body.data).toEqual({ mobile_public_shop: true })
    expect(isPlatformFeatureEnabled).toHaveBeenCalledWith('mobile_public_shop')
  })
})
