import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}))

vi.mock('./notification.service.js', () => ({
  notifyTenantUsers: vi.fn(),
}))

vi.mock('./supplier-order-stock.service.js', () => ({
  releaseStockForOrder: vi.fn(),
  reserveStockForPlacedOrder: vi.fn(),
}))

vi.mock('../lib/subscription.js', () => ({
  isFeatureEnabled: vi.fn(),
}))

vi.mock('./resolve-product-price.service.js', () => ({
  resolveProductPrice: vi.fn(),
}))

import { applyAmendmentItems } from './order-amendments.service.js'
import { resolveProductPrice } from './resolve-product-price.service.js'

/**
 * Router-style client: answers by SQL shape so the tests do not depend on query order.
 */
function amendmentClient({ changeType, amendmentItem, orderLine, substituteProduct }) {
  const client = {
    query: vi.fn(async (sql) => {
      const text = String(sql)
      if (text.includes('FROM order_amendment_items')) return { rows: [amendmentItem] }
      if (text.includes('SELECT change_type FROM order_amendments')) {
        return { rows: [{ change_type: changeType }] }
      }
      if (text.includes('FROM customer_order WHERE id')) {
        return {
          rows: [{ restaurant_id: 'rest-1', requested_delivery_date: null, currency: 'USD' }],
        }
      }
      if (text.includes('FROM order_item WHERE id')) {
        return { rows: orderLine ? [orderLine] : [] }
      }
      if (text.includes('FROM product WHERE id')) {
        return { rows: substituteProduct ? [substituteProduct] : [] }
      }
      if (text.includes('COALESCE(SUM(line_total)')) return { rows: [{ total: '0' }] }
      if (text.includes('promotion_usages')) return { rows: [{ discount: '0' }] }
      if (text.includes('loyalty_ledger')) {
        return { rows: [{ delivery_fee: '0', loyalty_discount: '0' }] }
      }
      return { rows: [], rowCount: 1 }
    }),
  }
  return client
}

function findUpdate(client, fragment) {
  return client.query.mock.calls.find(([sql]) => String(sql).includes(fragment))
}

describe('applyAmendmentItems input integrity (B11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveProductPrice.mockResolvedValue(null)
  })

  describe('quantity_change', () => {
    const orderLine = { product_id: 'p1', supplier_id: 'sup-1', unit_price: '10', quantity: 2 }

    it.each([0, -3, Number.NaN])('rejects requested quantity %s', async (requested) => {
      const client = amendmentClient({
        changeType: 'quantity_change',
        amendmentItem: { order_item_id: 'line-1', requested_quantity: requested, unit_price: 1 },
        orderLine,
      })
      await expect(applyAmendmentItems(client, 'ord-1', 'am-1')).rejects.toThrow(/positive number/i)
      expect(findUpdate(client, 'UPDATE order_item')).toBeUndefined()
    })

    it('keeps the stored unit price and ignores the client-supplied one', async () => {
      const client = amendmentClient({
        changeType: 'quantity_change',
        amendmentItem: { order_item_id: 'line-1', requested_quantity: 3, unit_price: 0.01 },
        orderLine,
      })
      await applyAmendmentItems(client, 'ord-1', 'am-1')

      const update = findUpdate(client, 'SET quantity = $1, line_total = $2, unit_price = $3')
      expect(update[1]).toEqual([3, 30, 10, 'line-1', 'ord-1'])
    })

    it('uses the server price (not the client price) when the stored price is 0', async () => {
      resolveProductPrice.mockResolvedValue({
        unitPrice: 8,
        source: 'DEFAULT_PRICE',
        contractPriceId: null,
        currency: 'USD',
      })
      const client = amendmentClient({
        changeType: 'quantity_change',
        amendmentItem: { order_item_id: 'line-1', requested_quantity: 2, unit_price: 0.01 },
        orderLine: { ...orderLine, unit_price: '0' },
      })
      await applyAmendmentItems(client, 'ord-1', 'am-1')

      // 0 means "unpriced": the server resolves 8; the client's 0.01 is never consulted.
      const update = findUpdate(client, 'UPDATE order_item')
      expect(update[1].slice(0, 3)).toEqual([2, 16, 8])
    })

    it('keeps the stored 0 price (never the client price) when the server cannot resolve one', async () => {
      resolveProductPrice.mockResolvedValue(null)
      const client = amendmentClient({
        changeType: 'quantity_change',
        amendmentItem: { order_item_id: 'line-1', requested_quantity: 2, unit_price: 0.01 },
        orderLine: { ...orderLine, unit_price: '0' },
      })
      await applyAmendmentItems(client, 'ord-1', 'am-1')

      const update = findUpdate(client, 'UPDATE order_item')
      expect(update[1].slice(0, 3)).toEqual([2, 0, 0])
    })

    it('rejects an order item that is not on this order', async () => {
      const client = amendmentClient({
        changeType: 'quantity_change',
        amendmentItem: { order_item_id: 'line-x', requested_quantity: 2, unit_price: 1 },
        orderLine: null,
      })
      await expect(applyAmendmentItems(client, 'ord-1', 'am-1')).rejects.toThrow(/not found/i)
    })
  })

  describe('item_substitution', () => {
    const orderLine = { product_id: 'p1', supplier_id: 'sup-1', unit_price: '10', quantity: 4 }
    const substituteItem = {
      order_item_id: 'line-1',
      substitute_product_id: 'p2',
      requested_quantity: null,
      original_quantity: null,
      unit_price: 0.01,
    }

    it('rejects a line when no server price resolves (never falls back to the client price)', async () => {
      resolveProductPrice.mockResolvedValue(null)
      const client = amendmentClient({
        changeType: 'item_substitution',
        amendmentItem: substituteItem,
        orderLine,
        substituteProduct: { supplier_id: 'sup-1' },
      })
      await expect(applyAmendmentItems(client, 'ord-1', 'am-1')).rejects.toThrow(/price/i)
      expect(findUpdate(client, 'UPDATE order_item')).toBeUndefined()
    })

    it('rejects a substitute product that belongs to another supplier', async () => {
      resolveProductPrice.mockResolvedValue({
        unitPrice: 5,
        source: 'DEFAULT_PRICE',
        currency: 'USD',
      })
      const client = amendmentClient({
        changeType: 'item_substitution',
        amendmentItem: substituteItem,
        orderLine,
        substituteProduct: { supplier_id: 'other-supplier' },
      })
      await expect(applyAmendmentItems(client, 'ord-1', 'am-1')).rejects.toThrow(
        /order.s supplier|same supplier|belong/i
      )
      expect(findUpdate(client, 'UPDATE order_item')).toBeUndefined()
    })

    it('substitutes with the server price, keeps the order quantity and the order supplier', async () => {
      resolveProductPrice.mockResolvedValue({
        unitPrice: 5,
        source: 'DEFAULT_PRICE',
        contractPriceId: null,
        currency: 'USD',
      })
      const client = amendmentClient({
        changeType: 'item_substitution',
        amendmentItem: substituteItem,
        orderLine,
        substituteProduct: { supplier_id: 'sup-1' },
      })
      await applyAmendmentItems(client, 'ord-1', 'am-1')

      const update = findUpdate(client, 'SET product_id = $1')
      expect(String(update[0])).not.toContain('supplier_id')
      // qty defaults to the order line's quantity (4), not 1; price is the server's 5.
      expect(update[1].slice(0, 4)).toEqual(['p2', 4, 5, 20])
    })

    it('rejects a non-positive requested quantity on a substitution', async () => {
      resolveProductPrice.mockResolvedValue({
        unitPrice: 5,
        source: 'DEFAULT_PRICE',
        currency: 'USD',
      })
      const client = amendmentClient({
        changeType: 'item_substitution',
        amendmentItem: { ...substituteItem, requested_quantity: -1 },
        orderLine,
        substituteProduct: { supplier_id: 'sup-1' },
      })
      await expect(applyAmendmentItems(client, 'ord-1', 'am-1')).rejects.toThrow(/positive number/i)
    })
  })
})
