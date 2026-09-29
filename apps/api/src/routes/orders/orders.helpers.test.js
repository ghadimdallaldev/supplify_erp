import { describe, expect, it } from 'vitest'
import { buildOrderCustomerContract, orderListSchema } from './orders.helpers.js'

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
