/**
 * Deal boost money path: approve → invoice → pay-activation → active.
 * Mirrors production live billing without requiring Playwright/web.
 */
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

const mockPromoBilling = vi.hoisted(() => ({
  createDealBoostInvoice: vi.fn(),
  chargePromotionAdInvoice: vi.fn(),
  getPromotionAdSpendSummary: vi.fn(async () => ({
    boost_ad_spend: 39,
    featured_ad_spend: 0,
    total_ad_spend: 39,
    open_ad_invoices: 0,
    refunded_ad_invoices: 0,
  })),
  markPromotionAdInvoicePaidManual: vi.fn(),
  markPromotionAdInvoiceRefunded: vi.fn(),
  isPromotionAdPaymentWaived: vi.fn(() => false),
  DEAL_BOOST_INVOICE_TYPE: 'deal_boost',
}))

vi.mock('../lib/billing/promotion-ad-billing.js', () => mockPromoBilling)

vi.mock('../services/deal-publish.service.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isBoostPaymentWaived: vi.fn(() => false),
    publishDealAfterApproval: vi.fn(async (deal) => ({
      deal: { ...deal, status: 'active', payment_status: 'paid' },
      campaign: { id: 'campaign-1' },
    })),
  }
})

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(async (fn) => fn({ query: queryMock })),
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    requireAuth: vi.fn(async (req, res, next) => {
      req.userData = req.userData || { ...mockUser, role: 'ADMIN', id: 'admin-1' }
      next()
    }),
    resolveTenantContext: (req, res, next) => {
      req.tenantContext = req.tenantContext || {
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: ['CATALOG_MANAGE', 'PROMOTIONS_MANAGE'],
      }
      next()
    },
    resolveAdminContext: (req, res, next) => {
      req.adminContext = { permissions: ['ADMIN_ACCESS'] }
      next()
    },
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
    getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
  })
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  requireWithinLimit: () => (req, res, next) => next(),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyDealApproved: vi.fn().mockResolvedValue(undefined),
  notifyDealRejected: vi.fn().mockResolvedValue(undefined),
  notifyDealSubmitted: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/deal-promotions.service.js', () => ({
  discoverDealsForRestaurant: vi.fn().mockResolvedValue([]),
  loadDealDetailForRestaurant: vi.fn(),
  recordDealInteraction: vi.fn(),
  createDealPromotionCampaign: vi.fn(),
  getDealAnalytics: vi.fn(),
  enrichPromotionRow: vi.fn(async (row) => row),
  enrichPromotionRows: vi.fn(async (rows) => rows),
  getEligibleProductsForDeal: vi.fn(),
  getActiveDealPromotion: vi.fn(),
  previewDealForCart: vi.fn(),
  getSupplierDealsAnalyticsSummary: vi.fn(),
}))

vi.mock('../services/promotions.service.js', () => ({
  loadActivePromotionsForSupplier: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}))

import { promotionsRoutes } from './promotions.routes.js'
import { errorHandler } from '../middlewares/errorHandler.js'

describe('deal boost money flow (approve → invoice → pay)', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    vi.clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      next()
    })
    app.use('/api/promotions', promotionsRoutes)
    app.use(errorHandler)
  })

  it('admin approve creates boost invoice when payment required', async () => {
    mockPromoBilling.createDealBoostInvoice.mockResolvedValueOnce({
      invoice: { id: 'inv-boost-1', status: 'OPEN', amount: 39 },
      created: true,
    })
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'deal-1',
            status: 'pending_approval',
            supplier_id: 'supplier-1',
            boost_pricing_key: 'boost_weekly',
            boost_package_id: 'pkg-1',
            boost_price_snapshot: '39',
            boost_duration_days: 7,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'deal-1',
            status: 'approved_pending_payment',
            payment_status: 'pending',
            supplier_id: 'supplier-1',
            boost_price_snapshot: '39',
            boost_pricing_key: 'boost_weekly',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'deal-1',
            status: 'approved_pending_payment',
            payment_status: 'pending',
            supplier_id: 'supplier-1',
            billing_invoice_id: 'inv-boost-1',
            boost_price_snapshot: '39',
          },
        ],
      })

    const res = await request(app).post('/api/promotions/admin/deal-1/approve').expect(200)

    expect(mockPromoBilling.createDealBoostInvoice).toHaveBeenCalled()
    expect(res.body.data.deal.status).toBe('approved_pending_payment')
    expect(res.body.data.deal.billing_invoice_id).toBe('inv-boost-1')
  })

  it('admin mark-boost-paid publishes without gateway', async () => {
    mockPromoBilling.createDealBoostInvoice.mockResolvedValueOnce({
      invoice: { id: 'inv-2', status: 'OPEN', amount: 39 },
      created: true,
    })
    mockPromoBilling.markPromotionAdInvoicePaidManual.mockResolvedValueOnce({
      invoice: { id: 'inv-2', status: 'PAID' },
      duplicate: false,
    })
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'deal-1',
            status: 'approved_pending_payment',
            payment_status: 'pending',
            supplier_id: 'supplier-1',
            boost_price_snapshot: '39',
            billing_invoice_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'deal-1',
            status: 'active',
            payment_status: 'paid',
            supplier_id: 'supplier-1',
            billing_invoice_id: 'inv-2',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post('/api/promotions/admin/deal-1/mark-boost-paid')
      .send({ reason: 'bank_transfer' })
      .expect(200)

    expect(mockPromoBilling.markPromotionAdInvoicePaidManual).toHaveBeenCalled()
    expect(res.body.data.deal.status).toBe('active')
  })

  it('admin insights include ad spend fields', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            total_deals: 1,
            active_deals: 1,
            pending_approval: 0,
            pending_payment: 0,
            unpaid_deals: 0,
            expired_deals: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ total_views: 10, total_interactions: 12, order_interactions: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ orders_from_deals: 2, total_discount_given: 5, total_revenue: 100 }],
      })
      .mockResolvedValueOnce({ rows: [] })

    const res = await request(app).get('/api/promotions/admin/deals/insights').expect(200)
    expect(res.body.data.insights.total_ad_spend).toBe(39)
    expect(res.body.data.insights.boost_ad_spend).toBe(39)
  })

  it('supplier pay-activation charges invoice then publishes', async () => {
    mockPromoBilling.chargePromotionAdInvoice.mockResolvedValueOnce({
      invoice: { id: 'inv-boost-1', status: 'PAID', amount: 39 },
      payment: { id: 'pay-1', status: 'SUCCEEDED' },
      duplicate: false,
    })
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'deal-1',
            status: 'approved_pending_payment',
            payment_status: 'pending',
            supplier_id: 'supplier-1',
            boost_price_snapshot: '39',
            boost_pricing_key: 'boost_weekly',
            billing_invoice_id: 'inv-boost-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'deal-1',
            status: 'active',
            payment_status: 'paid',
            supplier_id: 'supplier-1',
            billing_invoice_id: 'inv-boost-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post('/api/promotions/deal-1/pay-activation')
      .send({ idempotencyKey: 'deal-boost:deal-1:test-key-123' })
      .expect(200)

    expect(mockPromoBilling.chargePromotionAdInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'inv-boost-1',
        supplierId: 'supplier-1',
        idempotencyKey: 'deal-boost:deal-1:test-key-123',
      })
    )
    expect(res.body.data.promotion.status).toBe('active')
  })
})
