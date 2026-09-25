import { describe, expect, it } from 'vitest'
import {
  getConsumerOrderStatusError,
  minimumOrderError,
  consumerTicketDay,
  nextConsumerOrderNumber,
  requiredOrderMinimum,
} from './consumer-order.service.js'

describe('nextConsumerOrderNumber', () => {
  it('starts at 0001 for the day', () => {
    expect(nextConsumerOrderNumber(null, '20260925')).toBe('CO-20260925-0001')
  })

  it('continues from the highest ticket, including after 9999', () => {
    expect(nextConsumerOrderNumber('CO-20260925-0009', '20260925')).toBe('CO-20260925-0010')
    expect(nextConsumerOrderNumber('CO-20260925-9999', '20260925')).toBe('CO-20260925-10000')
  })

  it('keeps takeaway and delivery on the higher minimum', () => {
    expect(requiredOrderMinimum({ min_order_amount: 15 }, null)).toBe(15)
    expect(requiredOrderMinimum({ min_order_amount: 15 }, { min_order_amount: 25 })).toBe(25)
    expect(minimumOrderError(10, 15)?.name).toBe('MIN_ORDER_NOT_MET')
    expect(minimumOrderError(15, 15)).toBeNull()
  })

  it('uses the restaurant local day after midnight', () => {
    expect(consumerTicketDay('2026-09-24T21:30:00.000Z', 'Asia/Beirut')).toBe('20260925')
    expect(consumerTicketDay('2026-09-25T23:30:00.000Z', 'Asia/Beirut')).toBe('20260926')
  })

  it('refuses to cancel a delivered guest order', () => {
    expect(getConsumerOrderStatusError('DELIVERED', 'CANCELLED')).toMatch(/cannot be cancelled/)
    expect(getConsumerOrderStatusError('PREPARING', 'CANCELLED')).toBeNull()
  })

  it('ignores a ticket from another day', () => {
    expect(nextConsumerOrderNumber('CO-20260924-0042', '20260925')).toBe('CO-20260925-0001')
  })
})
