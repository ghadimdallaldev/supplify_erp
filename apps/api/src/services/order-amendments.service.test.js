import { describe, expect, it, vi, beforeEach } from 'vitest'

const { releaseStockForOrder, reserveStockForPlacedOrder, isFeatureEnabled, clientQuery } =
  vi.hoisted(() => ({
    releaseStockForOrder: vi.fn(),
    reserveStockForPlacedOrder: vi.fn(),
    isFeatureEnabled: vi.fn(),
    clientQuery: vi.fn(),
  }))

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
  withTransaction: async (fn) => fn({ query: clientQuery }),
}))

import {
  acceptAmendment,
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

  describe('acceptAmendment', () => {
    it('supersedes warehouse legs released while applying the change', async () => {
      clientQuery.mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('SELECT status FROM customer_order')) {
          return { rows: [{ status: 'PLACED' }] }
        }
        if (text.includes('FROM order_amendments WHERE id')) {
          return {
            rows: [{ id: 'am-1', status: 'pending', requested_by: 'user-a', description: 'qty' }],
          }
        }
        if (text.includes('FROM order_amendment_items')) return { rows: [] }
        if (text.includes('change_type')) return { rows: [{ change_type: 'quantity_change' }] }
        if (text.includes('requested_delivery_date')) {
          return { rows: [{ restaurant_id: 'rest-1', requested_delivery_date: null }] }
        }
        if (text.includes('SELECT * FROM customer_order')) {
          return { rows: [{ id: 'ord-1', restaurant_id: 'rest-1' }] }
        }
        if (text.includes('FROM order_item')) {
          return { rows: [{ supplier_id: 'sup-1', product_id: 'p1', quantity: 2, sku: 'SKU' }] }
        }
        if (text.includes('FROM supplier')) return { rows: [{ id: 'sup-1' }] }
        if (text.includes('COALESCE(SUM')) return { rows: [{ total: '20' }] }
        if (text.includes('order_promotions') || text.includes('discount')) {
          return { rows: [{ discount: '0' }] }
        }
        if (text.includes('UPDATE order_amendments')) {
          return { rows: [{ id: 'am-1', status: 'accepted' }] }
        }
        return { rows: [], rowCount: 1 }
      })
      isFeatureEnabled.mockResolvedValue(false)

      await acceptAmendment('am-1', 'ord-1', 'user-b', null)

      const supersede = clientQuery.mock.calls.find(([sql]) =>
        String(sql).includes("status = 'superseded'")
      )
      expect(supersede?.[1]).toEqual(['ord-1'])
      expect(releaseStockForOrder).toHaveBeenCalled()
      expect(reserveStockForPlacedOrder).toHaveBeenCalled()
    })
  })
})
