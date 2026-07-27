import { describe, expect, it } from 'vitest'
import { canAmendOrderStatus, MUTABLE_ORDER_STATUSES } from './order-amendments.service.js'

describe('order-amendments.service', () => {
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
})
