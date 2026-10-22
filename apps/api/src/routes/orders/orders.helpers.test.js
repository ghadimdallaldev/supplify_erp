import { describe, expect, it, vi } from 'vitest'
import {
  buildOrderCustomerContract,
  markLegacyOrderDelivered,
  orderListSchema,
} from './orders.helpers.js'

describe('orderListSchema includeItems default', () => {
  it('defaults includeItems to false when omitted', () => {
    const parsed = orderListSchema.parse({})
    expect(parsed.includeItems).toBe(false)
  })

  it('parses includeItems=true when explicitly requested', () => {
    const parsed = orderListSchema.parse({ includeItems: 'true' })
    expect(parsed.includeItems).toBe(true)
  })

  it('parses includeItems=false when explicitly false', () => {
    const parsed = orderListSchema.parse({ includeItems: 'false' })
    expect(parsed.includeItems).toBe(false)
  })
})

describe('markLegacyOrderDelivered', () => {
  it('rejects a cancelled order and does not write DELIVERED', async () => {
    const query = vi.fn(async (sql) => {
      if (String(sql).includes('FOR UPDATE')) {
        return { rows: [{ id: 'order-1', status: 'CANCELLED' }] }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(markLegacyOrderDelivered({ query }, 'order-1')).rejects.toThrow(
      /Cannot change order status from CANCELLED/
    )
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('marks a shipped order delivered only while that status is still locked', async () => {
    const query = vi.fn(async (sql) => {
      if (String(sql).includes('FOR UPDATE')) {
        return {
          rows: [{ id: 'order-1', status: 'SHIPPED', requested_delivery_method: 'DELIVERY' }],
        }
      }
      expect(String(sql)).toContain('AND status = $2')
      return { rows: [], rowCount: 1 }
    })

    const order = await markLegacyOrderDelivered({ query }, 'order-1')
    expect(order.status).toBe('DELIVERED')
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('AND status = $2'), [
      'order-1',
      'SHIPPED',
    ])
  })

  it('fails closed when the conditional update loses the race', async () => {
    const query = vi.fn(async (sql) => {
      if (String(sql).includes('FOR UPDATE')) {
        return { rows: [{ id: 'order-1', status: 'SHIPPED' }] }
      }
      return { rows: [], rowCount: 0 }
    })

    await expect(markLegacyOrderDelivered({ query }, 'order-1')).rejects.toThrow(
      /Order state changed/
    )
  })
})

describe('buildOrderCustomerContract', () => {
  it('adds the public-order contract while preserving contact visibility', () => {
    expect(
      buildOrderCustomerContract({
        customer_type: 'GUEST',
        customer_display_name: 'Guest User',
        customer_contact_snapshot: {
          name: 'Guest User',
          phone: '+96170000000',
          email: 'guest@example.com',
        },
        requested_delivery_method: 'DELIVERY',
        checkout_payment_method: 'CASH_ON_DELIVERY',
        subtotal_amount: '20.00',
        delivery_fee: '4.00',
        total_amount: '24.00',
      })
    ).toEqual({
      customerType: 'GUEST',
      customer: {
        type: 'GUEST',
        name: 'Guest User',
        phone: '+96170000000',
        email: 'guest@example.com',
      },
      fulfillmentMethod: 'DELIVERY',
      paymentMethod: 'CASH_ON_DELIVERY',
      subtotal: 20,
      deliveryFee: 4,
      total: 24,
    })
  })

  it('uses a restaurant projection and legacy amount fallback', () => {
    expect(
      buildOrderCustomerContract({
        restaurant_id: 'restaurant-1',
        restaurant_name: 'Restaurant One',
        restaurant_slug: 'restaurant-one',
        total_amount: 18,
      })
    ).toMatchObject({
      customerType: 'RESTAURANT',
      customer: {
        type: 'RESTAURANT',
        id: 'restaurant-1',
        name: 'Restaurant One',
        slug: 'restaurant-one',
      },
      subtotal: 18,
      deliveryFee: 0,
      total: 18,
    })
  })
})
