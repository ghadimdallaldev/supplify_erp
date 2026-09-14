import { describe, it, expect } from 'vitest'
import { DELIVERED_ORDER_STATUSES, deliveredOrderStatusInSql } from './order-statuses.js'

describe('order-statuses', () => {
  it('includes invoiced and delivered lifecycle statuses', () => {
    expect(DELIVERED_ORDER_STATUSES).toContain('COMPLETED')
    expect(DELIVERED_ORDER_STATUSES).toContain('DELIVERED')
    expect(DELIVERED_ORDER_STATUSES).toContain('INVOICED')
    expect(DELIVERED_ORDER_STATUSES).toContain('RECEIVED_FULL')
  })

  it('builds SQL IN clause for qualified columns', () => {
    expect(deliveredOrderStatusInSql('o.status')).toBe(
      "o.status IN ('COMPLETED', 'DELIVERED', 'RECEIVED_PARTIAL', 'RECEIVED_FULL', 'RECEIVED_WITH_DISPUTE', 'INVOICED')"
    )
  })
})
