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
  listSupplierQuoteRequests,
  getSupplierQuoteRequestDetail,
  submitQuoteResponse,
  declineQuoteRequest,
  buildCartPayloadFromResponse,
  updateQuoteRequestStatus,
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

  it('refuses a response when the RFQ is closed after the initial read (TOCTOU)', async () => {
    queryMock
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
      .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] })

    const clientQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ id: 'qr-1', status: 'closed' }],
    })
    withTransactionMock.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    await expect(
      submitQuoteResponse({
        supplierId: 'supplier-1',
        quoteRequestSupplierId: 'qrs-1',
        items: [{ quoteRequestItemId: 'item-1', unitPrice: 10 }],
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(clientQuery.mock.calls[0][0]).toMatch(/FOR UPDATE/)
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
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'supplier-1', name: 'Fresh Co', account_status: 'ACTIVE', is_blocked: false }],
      })
      .mockResolvedValueOnce({
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

  it('rejects when any invited supplier is ineligible', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'supplier-blocked',
          name: 'Blocked Co',
          account_status: 'ACTIVE',
          is_blocked: true,
        },
      ],
    })
    await expect(
      createQuoteRequest({
        restaurantId: 'rest-1',
        userId: 'user-1',
        items: [{ productId: 'product-1', quantity: 1 }],
        supplierIds: ['supplier-blocked'],
      })
    ).rejects.toThrow('Cannot invite ineligible supplier')
  })

  it('rejects products that do not belong to any invited supplier', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'supplier-1', name: 'Fresh Co', account_status: 'ACTIVE', is_blocked: false }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'product-1',
            supplier_id: 'supplier-other',
            name: 'Chicken',
            sku: 'CHK',
            unit: 'kg',
          },
        ],
      })

    await expect(
      createQuoteRequest({
        restaurantId: 'rest-1',
        userId: 'user-1',
        items: [{ productId: 'product-1', quantity: 1 }],
        supplierIds: ['supplier-1'],
      })
    ).rejects.toThrow('do not belong to any invited supplier')
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

  it('getSupplierQuoteRequestDetail exposes canRespond when RFQ is open and not declined', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            restaurant_name: 'Test Rest',
            status: 'pending',
            quote_request_status: 'open',
            quote_request_note: null,
            needed_by: null,
            quote_request_created_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const detail = await getSupplierQuoteRequestDetail('supplier-1', 'qrs-1')
    expect(detail.canRespond).toBe(true)
  })

  it('getSupplierQuoteRequestDetail sets canRespond false when quote request is closed', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            restaurant_name: 'Test Rest',
            status: 'pending',
            quote_request_status: 'closed',
            quote_request_note: null,
            needed_by: null,
            quote_request_created_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const detail = await getSupplierQuoteRequestDetail('supplier-1', 'qrs-1')
    expect(detail.canRespond).toBe(false)
  })

  it('getSupplierQuoteRequestDetail sets canRespond false when supplier declined', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            restaurant_name: 'Test Rest',
            status: 'declined',
            quote_request_status: 'open',
            quote_request_note: null,
            needed_by: null,
            quote_request_created_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const detail = await getSupplierQuoteRequestDetail('supplier-1', 'qrs-1')
    expect(detail.canRespond).toBe(false)
  })

  it('listSupplierQuoteRequests applies status filter, search, needed_by sort and counts envelope', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            status: 'pending',
            quote_request_status: 'open',
            quote_request_note: 'Urgent',
            needed_by: '2026-09-15',
            quote_request_created_at: new Date().toISOString(),
            restaurant_name: 'Golden Fork',
            item_count: 3,
            decline_reason: null,
            viewed_at: null,
            updated_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            total: 5,
            pending: 2,
            responded: 2,
            declined: 1,
            unread: 1,
            urgent: 1,
          },
        ],
      })

    const result = await listSupplierQuoteRequests('supplier-1', {
      status: 'pending',
      search: 'Golden',
      sort: 'needed_by',
      page: 1,
      limit: 20,
    })

    const listSql = queryMock.mock.calls[0][0]
    expect(listSql).toContain('qrs.status = $2')
    expect(listSql).toContain('r.name ILIKE $3')
    expect(listSql).toContain('qr.needed_by ASC NULLS LAST')
    expect(result.inbox).toHaveLength(1)
    expect(result.inbox[0].restaurantName).toBe('Golden Fork')
    expect(result.counts).toEqual({
      total: 5,
      pending: 2,
      responded: 2,
      declined: 1,
      unread: 1,
      urgent: 1,
    })
    expect(result.pagination.total).toBe(1)
  })

  it('refuses response when supplier previously declined', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'qrs-1',
          quote_request_id: 'qr-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'rest-1',
          status: 'declined',
          quote_request_status: 'open',
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
          .mockResolvedValueOnce({ rows: [{ id: 'qr-1', status: 'open' }] }) // FOR UPDATE lock
          .mockResolvedValueOnce({ rows: [] }) // existing response
          .mockResolvedValueOnce({ rows: [{ id: 'resp-1' }] }) // insert response
          .mockResolvedValueOnce({ rows: [] }) // insert item
          .mockResolvedValueOnce({ rows: [] }), // update qrs status
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

  it('getSupplierQuoteRequestDetail filters items to supplier-owned products', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            quote_request_id: 'qr-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            restaurant_name: 'Test Rest',
            status: 'pending',
            quote_request_status: 'open',
            quote_request_note: null,
            needed_by: null,
            quote_request_created_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'item-1', product_id: 'product-1', quantity: 5, unit: 'kg' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ currency: 'AED' }] })

    const detail = await getSupplierQuoteRequestDetail('supplier-1', 'qrs-1')

    const itemsSql = queryMock.mock.calls[1][0]
    expect(itemsSql).toContain('p.supplier_id = $2')
    expect(queryMock.mock.calls[1][1]).toEqual(['qr-1', 'supplier-1'])
    expect(detail.defaultCurrency).toBe('AED')
  })

  it('buildCartPayloadFromResponse rejects supplier row from another quote request', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'qrs-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'rest-1',
          quote_request_id: 'qr-other',
          status: 'responded',
          quote_request_status: 'open',
        },
      ],
    })

    await expect(
      buildCartPayloadFromResponse({
        restaurantId: 'rest-1',
        quoteRequestId: 'qr-1',
        quoteRequestSupplierId: 'qrs-1',
      })
    ).rejects.toThrow('does not belong to this quote request')
  })

  it('buildCartPayloadFromResponse rejects wrong restaurant', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'qrs-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'rest-other',
          status: 'responded',
          quote_request_status: 'open',
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

  it('buildCartPayloadFromResponse uses substitute product when offered', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qrs-1',
            supplier_id: 'supplier-1',
            restaurant_id: 'rest-1',
            status: 'responded',
            quote_request_status: 'open',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'resp-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qri-1',
            product_id: 'product-original',
            substitute_product_id: 'product-sub',
            substitute_id: 'product-sub',
            requested_quantity: 5,
            quantity: 5,
            unit_price: 7.5,
            currency: 'USD',
            name: 'Original Rice',
            sku: 'RICE-ORIG',
            unit: 'kg',
            supplier_id: 'supplier-1',
            image_url: null,
            description: null,
            substitute_name: 'Substitute Rice',
            substitute_sku: 'RICE-SUB',
            substitute_unit: 'bag',
            substitute_image_url: null,
            substitute_description: 'Alt pack',
            supplier_name: 'Fresh Co',
            supplier_slug: 'fresh-co',
          },
        ],
      })

    const payload = await buildCartPayloadFromResponse({
      restaurantId: 'rest-1',
      quoteRequestSupplierId: 'qrs-1',
    })

    expect(payload.items[0].productId).toBe('product-sub')
    expect(payload.items[0].originalProductId).toBe('product-original')
    expect(payload.items[0].product.sku).toBe('RICE-SUB')
    expect(payload.items[0].quotedUnitPrice).toBe(7.5)
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
            quote_request_status: 'open',
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

  it('updateQuoteRequestStatus closes an open quote request', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qr-1',
            restaurant_id: 'rest-1',
            status: 'closed',
            note: null,
            needed_by: null,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'qr-1', restaurant_id: 'rest-1', status: 'closed' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const detail = await updateQuoteRequestStatus('qr-1', 'rest-1', 'closed')
    expect(detail.quoteRequest.status).toBe('closed')
  })
})
