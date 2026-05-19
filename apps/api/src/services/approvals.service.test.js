import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  findMatchingApprovalRule,
  approveOrderRequest,
  rejectOrderRequest,
} from './approvals.service.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./notification.service.js', () => ({
  notifyOrderStatusChange: vi.fn(),
  sendNotification: vi.fn(),
}))

import { query } from '../lib/db.js'

describe('approvals.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findMatchingApprovalRule', () => {
    const rules = [
      { id: '1', is_active: true, threshold_amount: 100 },
      { id: '2', is_active: true, threshold_amount: 500 },
      { id: '3', is_active: false, threshold_amount: 50 },
    ]

    it('returns null when order is under all thresholds', () => {
      expect(findMatchingApprovalRule(rules, 100)).toBeNull()
      expect(findMatchingApprovalRule(rules, 50)).toBeNull()
    })

    it('returns highest matching threshold rule', () => {
      const match = findMatchingApprovalRule(rules, 600)
      expect(match?.id).toBe('2')
    })

    it('matches when order exceeds lower threshold only', () => {
      const match = findMatchingApprovalRule(rules, 150)
      expect(match?.id).toBe('1')
    })

    it('ignores inactive rules', () => {
      const onlyInactive = [{ id: '3', is_active: false, threshold_amount: 10 }]
      expect(findMatchingApprovalRule(onlyInactive, 1000)).toBeNull()
    })
  })

  describe('approveOrderRequest', () => {
    it('rejects when approver is the requester', async () => {
      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            status: 'pending',
            approver_id: 'user-1',
            requested_by: 'user-1',
            order_id: 'o1',
            restaurant_id: 'r1',
            total_amount: 200,
          },
        ],
      })
      await expect(approveOrderRequest('a1', 'user-1')).rejects.toThrow('cannot approve your own')
    })
  })

  describe('rejectOrderRequest', () => {
    it('requires notes', async () => {
      await expect(rejectOrderRequest('a1', 'user-2', '')).rejects.toThrow('notes are required')
    })
  })
})
