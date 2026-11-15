import { unwrapOrderDetail } from './orders'
import type { Order } from '../../../types/supplify'

const order = {
  id: 'b5f13bd6-8f64-4e24-9a48-5f64e8da18ca',
  restaurant_id: 'restaurant-1',
  status: 'PLACED',
  total_amount: 12,
  currency: 'USD',
  created_at: '2026-09-26T00:00:00.000Z',
  updated_at: '2026-09-26T00:00:00.000Z',
} satisfies Order

describe('unwrapOrderDetail', () => {
  it('returns the order nested in the detail payload', () => {
    expect(unwrapOrderDetail({ order })).toBe(order)
  })

  it('rejects a payload that is not an order', () => {
    expect(() => unwrapOrderDetail(undefined)).toThrow('Order not found')
    expect(() => unwrapOrderDetail({ order: null })).toThrow('Order not found')
    expect(() => unwrapOrderDetail({ order: { ...order, id: '' } })).toThrow('Order not found')
  })
})
