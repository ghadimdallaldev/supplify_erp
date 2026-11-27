import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  DELIVERED_ORDER_STATUSES,
  assertCanEditReview,
  getRecentReviewsForSuppliersBatch,
  listSupplierReviews,
} from './reviews.service.js'
import { query } from '../lib/db.js'

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

  describe('review lists', () => {
    it('review lists never contain restaurant identity; own review marked is_own', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      await listSupplierReviews('sup-1', { limit: 5, offset: 0, viewerRestaurantId: 'rest-9' })
      const [sql, params] = vi.mocked(query).mock.calls[0]
      expect(sql).not.toMatch(/JOIN restaurant|restaurant_name|r\.name/)
      expect(sql).toContain("'Verified restaurant'")
      expect(sql).toMatch(/AS is_own/)
      expect(params).toContain('rest-9')

      vi.mocked(query).mockReset()
      vi.mocked(query).mockResolvedValueOnce({ rows: [] })
      await getRecentReviewsForSuppliersBatch(['sup-1'], 3)
      const [batchSql, batchParams] = vi.mocked(query).mock.calls[0]
      expect(batchSql).not.toMatch(/JOIN restaurant|restaurant_name/)
      expect(batchParams[2]).toBeNull()
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
