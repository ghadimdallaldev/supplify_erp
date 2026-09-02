import { describe, expect, it, vi, beforeEach } from 'vitest'

const releaseStockForOrder = vi.fn()
const reserveStockForPlacedOrder = vi.fn()
const isFeatureEnabled = vi.fn()

vi.mock('./supplier-order-stock.service.js', () => ({
  releaseStockForOrder: (...args) => releaseStockForOrder(...args),
  reserveStockForPlacedOrder: (...args) => reserveStockForPlacedOrder(...args),
}))

vi.mock('../lib/subscription.js', () => ({
  isFeatureEnabled: (...args) => isFeatureEnabled(...args),
}))

vi.mock('./notification.service.js', () => ({
  notifyTenantUsers: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: async (fn) => fn({ query: vi.fn() }),
}))

import {
  canAmendOrderStatus,
  MUTABLE_ORDER_STATUSES,
  recalculateOrderTotal,
} from './order-amendments.service.js'

describe('order-amendments.service', () => {
  beforeEach(() => {
    releaseStockForOrder.mockReset()
    reserveStockForPlacedOrder.mockReset()
    isFeatureEnabled.mockReset()
  })

  describe('canAmendOrderStatus', () => {
    it('allows mutable statuses', () => {
      for (const status of MUTABLE_ORDER_STATUSES) {
        expect(canAmendOrderStatus(status)).toBe(true)
      }
    })

    it('blocks shipped and delivered', () => {
      expect(canAmendOrderStatus('SHIPPED')).toBe(false)
      expect(canAmendOrderStatus('DELIVERED')).toBe(false)
      expect(canAmendOrderStatus('COMPLETED')).toBe(false)
    })
  })

  describe('recalculateOrderTotal', () => {
    it('subtracts existing promotion discounts from line subtotal', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ total: '100' }] })
          .mockResolvedValueOnce({ rows: [{ discount: '10' }] })
          .mockResolvedValueOnce({ rows: [] }),
      }

      const total = await recalculateOrderTotal('ord-1', client)

      expect(total).toBe(90)
      expect(client.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('UPDATE customer_order SET total_amount'),
        [90, 'ord-1']
      )
    })
  })
})
