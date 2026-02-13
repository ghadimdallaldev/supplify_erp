import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
vi.mock('./db.js', () => ({ query: (...args) => mockQuery(...args) }))
vi.mock('./logger.js', () => ({ logger: { error: vi.fn(), debug: vi.fn() } }))

describe('Subscription lib', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  describe('getTenantSubscription', () => {
    it('returns subscription when one exists', async () => {
      const { getTenantSubscription } = await import('./subscription.js')
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            tenant_id: 'rest-1',
            tenant_type: 'RESTAURANT',
            plan_id: 'plan-free',
            plan_name: 'Free',
            limits: { chats_per_day: 10 },
            features: { chat: 'enabled' },
          },
        ],
      })

      const result = await getTenantSubscription('rest-1', 'RESTAURANT')

      expect(result).not.toBeNull()
      expect(result.plan_name).toBe('Free')
      expect(result.limits.chats_per_day).toBe(10)
    })

    it('creates free subscription when none exists and returns it', async () => {
      const { getTenantSubscription } = await import('./subscription.js')
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'plan-free', name: 'Free', code: 'free' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-new',
              plan_name: 'Free',
              plan_display_name: 'Free',
              limits: { chats_per_day: 10 },
              features: {},
            },
          ],
        })

      const result = await getTenantSubscription('supp-1', 'SUPPLIER')

      expect(result).not.toBeNull()
      expect(result.plan_name).toBe('Free')
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO subscription'),
        expect.any(Array)
      )
    })
  })

  describe('checkLimit', () => {
    it('returns isOverLimit when no subscription', async () => {
      const { checkLimit } = await import('./subscription.js')
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })

      const result = await checkLimit('tenant-1', 'SUPPLIER', 'chats_per_day')

      expect(result.isOverLimit).toBe(true)
      expect(result.limit).toBe(0)
      expect(result.current).toBe(0)
    })

    it('returns limit info from subscription and usage_meter', async () => {
      const { checkLimit } = await import('./subscription.js')
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              limits: { chats_per_day: 10 },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ current_value: 3 }] })

      const result = await checkLimit('tenant-1', 'SUPPLIER', 'chats_per_day')

      expect(result.isOverLimit).toBe(false)
      expect(result.current).toBe(3)
      expect(result.limit).toBe(10)
    })
  })
})
