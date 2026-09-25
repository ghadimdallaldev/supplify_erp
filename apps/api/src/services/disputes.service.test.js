import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createDispute,
  resolveDispute,
  rejectDispute,
  generateCreditNoteNumber,
} from './disputes.service.js'
import { assertCleanUploadOwnership } from './storage/upload-security.service.js'

const queryMock = vi.fn()
const withTransactionMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (handler) => withTransactionMock(handler),
}))

vi.mock('./notification.service.js', () => ({
  notifyDisputeOpened: vi.fn().mockResolvedValue(undefined),
  notifyDisputeResolved: vi.fn().mockResolvedValue(undefined),
}))

const createReplacementOrderFromDisputeMock = vi.fn()

vi.mock('../lib/dispute-replacement-order.js', () => ({
  createReplacementOrderFromDispute: (...args) => createReplacementOrderFromDisputeMock(...args),
  NO_REPLACEMENT_LINES_MESSAGE:
    'Cannot create replacement order because no disputed quantities were found.',
}))

vi.mock('../lib/fulfillment-exceptions.js', () => ({
  createFulfillmentException: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./storage/upload-security.service.js', () => ({
  assertCleanUploadOwnership: vi.fn().mockResolvedValue({}),
}))

describe('Disputes Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    withTransactionMock.mockReset()
    vi.mocked(assertCleanUploadOwnership).mockReset().mockResolvedValue({})
    createReplacementOrderFromDisputeMock.mockReset()
    createReplacementOrderFromDisputeMock.mockResolvedValue('replacement-order-1')
  })

  describe('createDispute', () => {
    it('rejects dispute on non-delivered order', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'PLACED' }],
      })

      await expect(
        createDispute({
          restaurantId: 'r-1',
          userId: 'u-1',
          orderId: 'order-1',
          supplierId: 's-1',
          type: 'damaged_goods',
          description: 'Damaged items',
        })
      ).rejects.toMatchObject({ name: 'ValidationError' })
    })

    it('rejects an invoice that does not belong to the order', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'DELIVERED' }],
        })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      await expect(
        createDispute({
          restaurantId: 'r-1',
          userId: 'u-1',
          orderId: 'order-1',
          supplierId: 's-1',
          invoiceId: 'inv-other',
          type: 'damaged_goods',
          description: 'Damaged items',
        })
      ).rejects.toThrow(/Invoice does not belong to this order/)
    })

    it('rejects a disputed amount above the supplier lines on the order', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'DELIVERED' }],
        })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'oi-1',
              quantity: 2,
              unit_price: 10,
              line_total: 20,
              product_name: 'Rice',
            },
          ],
        })

      await expect(
        createDispute({
          restaurantId: 'r-1',
          userId: 'u-1',
          orderId: 'order-1',
          supplierId: 's-1',
          type: 'damaged_goods',
          description: 'Damaged items',
          disputedAmount: 500,
        })
      ).rejects.toThrow(/supplier total/)
    })

    it('rejects the same order item twice on one dispute', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'DELIVERED' }],
        })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'oi-1',
              quantity: 4,
              unit_price: 10,
              line_total: 40,
              product_name: 'Rice',
            },
          ],
        })

      await expect(
        createDispute({
          restaurantId: 'r-1',
          userId: 'u-1',
          orderId: 'order-1',
          supplierId: 's-1',
          type: 'short_delivery',
          description: 'Missing items',
          items: [
            { orderItemId: 'oi-1', quantityReceived: 1 },
            { orderItemId: 'oi-1', quantityReceived: 2 },
          ],
        })
      ).rejects.toThrow(/only once/)
    })

    it('rejects a dispute line that is not on this order', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'DELIVERED' }],
        })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'oi-1',
              quantity: 2,
              unit_price: 10,
              line_total: 20,
              product_name: 'Rice',
            },
          ],
        })

      await expect(
        createDispute({
          restaurantId: 'r-1',
          userId: 'u-1',
          orderId: 'order-1',
          supplierId: 's-1',
          type: 'damaged_goods',
          description: 'Damaged items',
          items: [{ orderItemId: 'other-order-line', quantityReceived: 1 }],
        })
      ).rejects.toThrow(/does not belong to this order/)
    })

    it('sets RECEIVED_WITH_DISPUTE when opening dispute on received order', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'RECEIVED_PARTIAL' }],
        })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'd-1', order_status: 'RECEIVED_WITH_DISPUTE' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      const updateStatus = vi.fn().mockResolvedValue({ rows: [] })
      withTransactionMock.mockImplementation(async (handler) => {
        const client = {
          query: vi.fn().mockImplementation((sql) => {
            const text = String(sql)
            if (text.includes('FROM customer_order') && text.includes('FOR UPDATE')) {
              return Promise.resolve({ rows: [{ id: 'order-1', status: 'RECEIVED_PARTIAL' }] })
            }
            if (text.includes('FROM disputes WHERE order_id')) {
              return Promise.resolve({ rows: [] })
            }
            if (text.includes('RECEIVED_WITH_DISPUTE')) return updateStatus()
            return Promise.resolve({
              rows: [
                {
                  id: 'd-1',
                  order_id: 'order-1',
                  restaurant_id: 'r-1',
                  supplier_id: 's-1',
                  type: 'damaged_goods',
                  status: 'open',
                  description: 'Damaged items',
                  disputed_amount: null,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            })
          }),
        }
        return handler(client)
      })

      await createDispute({
        restaurantId: 'r-1',
        userId: 'u-1',
        orderId: 'order-1',
        supplierId: 's-1',
        type: 'damaged_goods',
        description: 'Damaged items',
      })

      expect(updateStatus).toHaveBeenCalled()
    })

    it('allows dispute on DELIVERED order', async () => {
      const disputeRow = {
        id: 'd-1',
        order_id: 'order-1',
        restaurant_id: 'r-1',
        supplier_id: 's-1',
        type: 'damaged_goods',
        status: 'open',
        description: 'Damaged items',
        disputed_amount: null,
        created_at: new Date(),
        updated_at: new Date(),
        restaurant_name: 'Test Restaurant',
        supplier_name: 'Test Supplier',
        order_status: 'DELIVERED',
      }

      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'DELIVERED' }],
        })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [disputeRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      withTransactionMock.mockImplementation(async (handler) => {
        const client = {
          query: vi.fn().mockImplementation((sql) => {
            const text = String(sql)
            if (text.includes('FROM customer_order') && text.includes('FOR UPDATE')) {
              return Promise.resolve({ rows: [{ id: 'order-1', status: 'DELIVERED' }] })
            }
            if (text.includes('FROM disputes WHERE order_id')) {
              return Promise.resolve({ rows: [] })
            }
            return Promise.resolve({ rows: [disputeRow] })
          }),
        }
        return handler(client)
      })

      const result = await createDispute({
        restaurantId: 'r-1',
        userId: 'u-1',
        orderId: 'order-1',
        supplierId: 's-1',
        type: 'damaged_goods',
        description: 'Damaged items',
      })

      expect(result?.dispute?.id).toBe('d-1')
    })

    it('rejects duplicate active dispute on same order', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'COMPLETED' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 's-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-dispute' }] })

      await expect(
        createDispute({
          restaurantId: 'r-1',
          userId: 'u-1',
          orderId: 'order-1',
          supplierId: 's-1',
          type: 'short_delivery',
          description: 'Missing items',
        })
      ).rejects.toMatchObject({ name: 'ConflictError' })
    })

    it('requires every supplied attachment to be a clean upload owned by the restaurant tenant', async () => {
      const disputeRow = {
        id: 'd-1',
        order_id: 'order-1',
        restaurant_id: 'r-1',
        supplier_id: 's-1',
        type: 'damaged_goods',
        status: 'open',
        description: 'Damaged items',
        disputed_amount: null,
        created_at: new Date(),
        updated_at: new Date(),
        order_status: 'DELIVERED',
      }
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'r-1', status: 'DELIVERED' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 's-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'session-1' }] })
        .mockResolvedValueOnce({ rows: [disputeRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
      withTransactionMock.mockImplementation(async (handler) =>
        handler({
          query: vi.fn().mockImplementation((sql) => {
            const text = String(sql)
            if (text.includes('FROM customer_order') && text.includes('FOR UPDATE')) {
              return Promise.resolve({ rows: [{ id: 'order-1', status: 'DELIVERED' }] })
            }
            if (text.includes('FROM disputes WHERE order_id')) {
              return Promise.resolve({ rows: [] })
            }
            return Promise.resolve({ rows: [disputeRow] })
          }),
        })
      )

      await createDispute({
        restaurantId: 'r-1',
        userId: 'u-1',
        orderId: 'order-1',
        supplierId: 's-1',
        type: 'damaged_goods',
        description: 'Damaged items',
        attachmentKeys: [{ fileKey: 'uploads/u-1/evidence.jpg', fileName: 'evidence.jpg' }],
      })

      expect(assertCleanUploadOwnership).toHaveBeenCalledWith('uploads/u-1/evidence.jpg', {
        userId: 'u-1',
        tenantId: 'r-1',
        tenantType: 'RESTAURANT',
      })
    })
  })

  describe('resolveDispute credit note validation', () => {
    it('requires positive creditNoteAmount for credit_note resolution', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'd-1',
            supplier_id: 's-1',
            restaurant_id: 'r-1',
            order_id: 'o-1',
            invoice_id: null,
            disputed_amount: '100.00',
            status: 'under_review',
          },
        ],
      })

      await expect(
        resolveDispute('d-1', 's-1', {
          resolutionType: 'credit_note',
          creditNoteAmount: 0,
        })
      ).rejects.toMatchObject({ name: 'ValidationError' })
    })

    it('rejects credit note amount above disputed amount', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'd-1',
            supplier_id: 's-1',
            restaurant_id: 'r-1',
            order_id: 'o-1',
            invoice_id: null,
            disputed_amount: '50.00',
            status: 'under_review',
          },
        ],
      })

      await expect(
        resolveDispute('d-1', 's-1', {
          resolutionType: 'credit_note',
          creditNoteAmount: 75,
        })
      ).rejects.toMatchObject({ name: 'ValidationError' })
    })

    it('caps a credit at the supplier order total when the dispute has no amount', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'd-1',
            supplier_id: 's-1',
            restaurant_id: 'r-1',
            order_id: 'o-1',
            invoice_id: null,
            disputed_amount: null,
            status: 'under_review',
          },
        ],
      })
      withTransactionMock.mockImplementation(async (handler) => {
        const client = {
          query: vi.fn(async (sql) => {
            const text = String(sql)
            if (text.includes('FROM disputes') && text.includes('FOR UPDATE')) {
              return {
                rows: [
                  {
                    id: 'd-1',
                    supplier_id: 's-1',
                    restaurant_id: 'r-1',
                    order_id: 'o-1',
                    invoice_id: null,
                    disputed_amount: null,
                    status: 'under_review',
                  },
                ],
              }
            }
            if (text.includes('supplier_total')) {
              return { rows: [{ supplier_total: '40.00', invoice_total: null }] }
            }
            return { rows: [] }
          }),
        }
        return handler(client)
      })

      await expect(
        resolveDispute('d-1', 's-1', {
          resolutionType: 'credit_note',
          creditNoteAmount: 100,
        })
      ).rejects.toThrow(/supplier total/)
    })
  })

  describe('rejectDispute', () => {
    it('requires resolution notes', async () => {
      await expect(rejectDispute('d-1', 's-1', '')).rejects.toMatchObject({
        name: 'ValidationError',
      })
    })
  })

  describe('resolveDispute replacement', () => {
    const disputeRow = {
      id: 'd-1',
      supplier_id: 's-1',
      restaurant_id: 'r-1',
      order_id: 'o-1',
      invoice_id: null,
      disputed_amount: '50.00',
      status: 'under_review',
      replacement_order_id: null,
    }

    function mockResolveTransaction() {
      withTransactionMock.mockImplementation(async (handler) => {
        const client = {
          query: vi.fn().mockImplementation((sql) => {
            if (String(sql).includes('FROM customer_order WHERE id')) {
              return Promise.resolve({
                rows: [{ id: 'o-1', restaurant_id: 'r-1', currency: 'USD', branch_id: null }],
              })
            }
            if (String(sql).includes('supplier_total')) {
              return Promise.resolve({ rows: [{ supplier_total: '50.00', invoice_total: null }] })
            }
            if (String(sql).includes('FROM dispute_items')) {
              return Promise.resolve({
                rows: [
                  {
                    order_item_id: 'oi-1',
                    quantity_ordered: 10,
                    quantity_received: 7,
                  },
                ],
              })
            }
            return Promise.resolve({ rows: [] })
          }),
        }
        return handler(client)
      })
    }

    function mockLoadDetail() {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'd-1',
            order_id: 'o-1',
            restaurant_id: 'r-1',
            supplier_id: 's-1',
            status: 'resolved',
            resolution_type: 'replacement',
            replacement_order_id: 'replacement-order-1',
            restaurant_name: 'R',
            supplier_name: 'S',
            order_status: 'RECEIVED_PARTIAL',
          },
        ],
      })
      queryMock.mockResolvedValue({ rows: [] })
    }

    it('creates replacement order when resolutionType is replacement', async () => {
      queryMock.mockResolvedValueOnce({ rows: [disputeRow] })
      mockResolveTransaction()
      mockLoadDetail()

      await resolveDispute('d-1', 's-1', {
        resolutionType: 'replacement',
        resolutionNotes: 'Shipping missing items',
      })

      expect(createReplacementOrderFromDisputeMock).toHaveBeenCalledTimes(1)
    })

    it('rejects when replacement order already exists', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ ...disputeRow, replacement_order_id: 'existing-rep' }],
      })

      await expect(
        resolveDispute('d-1', 's-1', { resolutionType: 'replacement' })
      ).rejects.toMatchObject({ name: 'ValidationError' })

      expect(createReplacementOrderFromDisputeMock).not.toHaveBeenCalled()
    })

    it('does not create replacement order for refund', async () => {
      queryMock.mockResolvedValueOnce({ rows: [disputeRow] })
      mockResolveTransaction()
      mockLoadDetail()

      await resolveDispute('d-1', 's-1', {
        resolutionType: 'refund',
        refundAmount: 10,
        refundReference: 'REF-1',
        resolutionNotes: 'Refund issued externally',
      })

      expect(createReplacementOrderFromDisputeMock).not.toHaveBeenCalled()
    })

    it('does not create replacement order for no_action', async () => {
      queryMock.mockResolvedValueOnce({ rows: [disputeRow] })
      mockResolveTransaction()
      mockLoadDetail()

      await resolveDispute('d-1', 's-1', {
        resolutionType: 'no_action',
        resolutionNotes: 'Closed without action',
      })

      expect(createReplacementOrderFromDisputeMock).not.toHaveBeenCalled()
    })
  })

  describe('generateCreditNoteNumber', () => {
    it('takes the next suffix after the highest number, under a month lock', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ seq: 12 }] }),
      }
      const year = new Date().getFullYear()
      const month = String(new Date().getMonth() + 1).padStart(2, '0')
      await expect(generateCreditNoteNumber(client)).resolves.toBe(`CN-${year}-${month}-013`)
      expect(client.query.mock.calls[0][0]).toMatch(/pg_advisory_xact_lock/)
      expect(client.query.mock.calls[1][0]).toMatch(/MAX/)
    })
  })
})
