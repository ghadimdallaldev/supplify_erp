import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDispute, resolveDispute, rejectDispute } from './disputes.service.js'

const queryMock = vi.fn()
const withTransactionMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (handler) => withTransactionMock(handler),
}))

vi.mock('./notification.service.js', () => ({
  sendNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

describe('Disputes Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    withTransactionMock.mockReset()
  })

  describe('createDispute', () => {
    it('rejects dispute on non-completed order', async () => {
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
})
