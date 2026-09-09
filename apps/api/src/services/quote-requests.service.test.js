import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const withTransactionMock = vi.fn()
const notifyQuoteRequestReceivedMock = vi.fn().mockResolvedValue(null)
const notifyQuoteResponseReceivedMock = vi.fn().mockResolvedValue(null)

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (...args) => withTransactionMock(...args),
}))

const notifyQuoteRequestDeclinedMock = vi.fn().mockResolvedValue(null)

vi.mock('./notification.service.js', () => ({
  notifyQuoteRequestReceived: (...args) => notifyQuoteRequestReceivedMock(...args),
  notifyQuoteResponseReceived: (...args) => notifyQuoteResponseReceivedMock(...args),
  notifyQuoteRequestDeclined: (...args) => notifyQuoteRequestDeclinedMock(...args),
}))

import {
  createQuoteRequest,
  listRestaurantQuoteRequests,
  getSupplierQuoteRequestDetail,
  submitQuoteResponse,
  declineQuoteRequest,
  buildCartPayloadFromResponse,
} from './quote-requests.service.js'
import { NotFoundError, ForbiddenError, ValidationError } from '../middlewares/errorHandler.js'

describe('quote-requests.service', () => {
  beforeEach(() => {
    queryMock.mockReset()
    withTransactionMock.mockReset()
    notifyQuoteRequestReceivedMock.mockClear()
    notifyQuoteResponseReceivedMock.mockClear()
    notifyQuoteRequestDeclinedMock.mockClear()
  })

  it('refuses a response once the restaurant has closed the quote request', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'qrs-1',
          quote_request_id: 'qr-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'rest-1',
          quote_request_status: 'closed',
        },
      ],
    })

    await expect(
      submitQuoteResponse({
        supplierId: 'supplier-1',
        quoteRequestSupplierId: 'qrs-1',
        items: [{ quoteRequestItemId: 'item-1' }],
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(withTransactionMock).not.toHaveBeenCalled()
    expect(notifyQuoteResponseReceivedMock).not.toHaveBeenCalled()
  })

  it('declines a pending request, stores the reason and notifies the restaurant', async () => {
    queryMock
      // load the inbox row
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            status: 'pending',
            quote_request_status: 'open',
          },
        ],
      })
      // the UPDATE
      .mockResolvedValueOnce({ rows: [] })
      // getSupplierQuoteRequestDetail: header, items, responses
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            restaurant_name: 'Test Rest',
            status: 'declined',
            decline_reason: 'Out of stock',
            quote_request_status: 'open',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const detail = await declineQuoteRequest({
      supplierId: 'supplier-1',
      quoteRequestSupplierId: 'qrs-1',
      reason: '  Out of stock  ',
    })

    const updateCall = queryMock.mock.calls.find(([sql]) => sql.includes("status = 'declined'"))
    expect(updateCall?.[1]).toEqual(['qrs-1', 'Out of stock'])
    expect(detail.declineReason).toBe('Out of stock')
    expect(notifyQuoteRequestDeclinedMock).toHaveBeenCalledTimes(1)
  })

  it('refuses to decline a request already responded to', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'qrs-1',
          quote_request_id: 'qr-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'rest-1',
          status: 'responded',
          quote_request_status: 'open',
        },
      ],
    })

    await expect(
      declineQuoteRequest({ supplierId: 'supplier-1', quoteRequestSupplierId: 'qrs-1' })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(notifyQuoteRequestDeclinedMock).not.toHaveBeenCalled()
  })

  it('creates quote request and notifies suppliers once each', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'supplier-1' }] }).mockResolvedValueOnce({
      rows: [
        { id: 'product-1', supplier_id: 'supplier-1', name: 'Chicken', sku: 'CHK', unit: 'kg' },
      ],
    })

    withTransactionMock.mockImplementation(async (fn) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rows: [{ id: 'qr-1', restaurant_id: 'rest-1', status: 'open' }],
          })
          .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] })
          .mockResolvedValueOnce({ rows: [{ id: 'qrs-1', supplier_id: 'supplier-1' }] }),
      }
      return fn(client)
    })

    const result = await createQuoteRequest({
      restaurantId: 'rest-1',
      userId: 'user-1',
      items: [{ productId: 'product-1', quantity: 10 }],
      supplierIds: ['supplier-1'],
      note: 'Need by Friday',
    })

    expect(result.quoteRequest.id).toBe('qr-1')
    expect(result.supplierCount).toBe(1)
    expect(notifyQuoteRequestReceivedMock).toHaveBeenCalledTimes(1)
    expect(notifyQuoteRequestReceivedMock).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: 'supplier-1', quoteRequestId: 'qr-1' })
    )
  })

  it('rejects when no eligible suppliers', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    await expect(
      createQuoteRequest({
        restaurantId: 'rest-1',
        userId: 'user-1',
        items: [{ productId: 'product-1', quantity: 1 }],
        supplierIds: ['supplier-blocked'],
      })
    ).rejects.toThrow('No eligible suppliers')
  })

  it('lists restaurant quote requests with pagination', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qr-1',
            restaurant_id: 'rest-1',
            status: 'open',
            note: null,
            needed_by: null,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            item_count: 2,
            supplier_count: 1,
            response_count: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })

    const result = await listRestaurantQuoteRequests('rest-1', { page: 1, limit: 20 })
    expect(result.quoteRequests).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
  })

  it('blocks supplier from viewing another supplier quote request', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    await expect(getSupplierQuoteRequestDetail('supplier-2', 'qrs-1')).rejects.toBeInstanceOf(
      NotFoundError
    )
  })

  it('submits quote response and notifies restaurant', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            quote_request_status: 'open',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] })

    withTransactionMock.mockImplementation(async (fn) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: 'resp-1' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      }
      return fn(client)
    })

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            restaurant_name: 'Test Rest',
            quote_request_note: null,
            needed_by: null,
            quote_request_status: 'open',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'resp-1', note: null, submitted_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] })

    await submitQuoteResponse({
      supplierId: 'supplier-1',
      userId: 'user-1',
      quoteRequestSupplierId: 'qrs-1',
      items: [{ quoteRequestItemId: 'item-1', isAvailable: true, unitPrice: 12.5, quantity: 10 }],
      note: 'Available',
    })

    expect(notifyQuoteResponseReceivedMock).toHaveBeenCalledTimes(1)
  })

  it('buildCartPayloadFromResponse rejects wrong restaurant', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'qrs-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'rest-other',
          status: 'responded',
        },
      ],
    })

    await expect(
      buildCartPayloadFromResponse({
        restaurantId: 'rest-1',
        quoteRequestSupplierId: 'qrs-1',
      })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('buildCartPayloadFromResponse returns cart items without creating order', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            status: 'responded',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'resp-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qri-1',
            product_id: 'product-1',
            requested_quantity: 5,
            quantity: 5,
            unit_price: 9.99,
            currency: 'USD',
            name: 'Rice',
            sku: 'RICE',
            unit: 'kg',
            supplier_id: 'supplier-1',
            image_url: null,
            description: null,
            supplier_name: 'Fresh Co',
            supplier_slug: 'fresh-co',
          },
        ],
      })

    const payload = await buildCartPayloadFromResponse({
      restaurantId: 'rest-1',
      quoteRequestSupplierId: 'qrs-1',
    })

    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].quotedUnitPrice).toBe(9.99)
    expect(payload.items[0].quoteResponseItemId).toBe('qri-1')
    expect(payload.quoteRequestSupplierId).toBe('qrs-1')
    expect(payload.disclaimer).toBeUndefined()
  })
})
