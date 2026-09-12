import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DELIVERED_ORDER_STATUSES, assertCanEditReview } from './reviews.service.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./notification.service.js', () => ({
  sendNotification: vi.fn(),
}))

describe('reviews.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('DELIVERED_ORDER_STATUSES', () => {
    it('includes post-delivery lifecycle statuses', () => {
      expect(DELIVERED_ORDER_STATUSES).toContain('COMPLETED')
      expect(DELIVERED_ORDER_STATUSES).toContain('INVOICED')
      expect(DELIVERED_ORDER_STATUSES).toContain('RECEIVED_FULL')
    })
  })

  describe('assertCanEditReview', () => {
    const baseReview = {
      reviewer_user_id: 'user-1',
      created_at: new Date().toISOString(),
    }

    it('allows owner within edit window', () => {
      expect(() => assertCanEditReview(baseReview, 'user-1')).not.toThrow()
    })

    it('rejects non-owner', () => {
      expect(() => assertCanEditReview(baseReview, 'user-2')).toThrow('own reviews')
    })

    it('rejects edits after 7 days', () => {
      const old = new Date()
      old.setDate(old.getDate() - 8)
      expect(() =>
        assertCanEditReview({ ...baseReview, created_at: old.toISOString() }, 'user-1')
      ).toThrow('7 days')
    })
  })
})
