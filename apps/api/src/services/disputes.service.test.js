import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDispute, resolveDispute, rejectDispute } from './disputes.service.js'

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

describe('Disputes Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    withTransactionMock.mockReset()
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
            if (String(sql).includes('RECEIVED_WITH_DISPUTE')) return updateStatus()
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
          query: vi.fn().mockResolvedValue({ rows: [disputeRow] }),
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
})
