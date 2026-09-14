import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
vi.mock('./db.js', () => ({ query: (...args) => mockQuery(...args) }))
vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('conversion-events', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  describe('recordConversionEvent', () => {
    it('inserts event with tenant and type', async () => {
      const { recordConversionEvent } = await import('./conversion-events.js')
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      await recordConversionEvent('tenant-1', 'RESTAURANT', 'VIEW_PLANS', {})

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO conversion_event'),
        ['tenant-1', 'RESTAURANT', 'VIEW_PLANS', '{}']
      )
    })

    it('passes metadata as JSON', async () => {
      const { recordConversionEvent } = await import('./conversion-events.js')
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      await recordConversionEvent('tenant-2', 'SUPPLIER', 'BLOCKED_LIMIT', {
        limitKey: 'orders_per_day',
        current: 10,
        limit: 10,
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'tenant-2',
          'SUPPLIER',
          'BLOCKED_LIMIT',
          expect.stringContaining('orders_per_day'),
        ])
      )
    })

    it('does not insert when eventType not allowed', async () => {
      const { recordConversionEvent } = await import('./conversion-events.js')

      await recordConversionEvent('tenant-1', 'RESTAURANT', 'INVALID_TYPE', {})

      expect(mockQuery).not.toHaveBeenCalled()
    })

    it('does not throw when table does not exist (42P01)', async () => {
      const { recordConversionEvent } = await import('./conversion-events.js')
      const err = new Error('relation "conversion_event" does not exist')
      err.code = '42P01'
      mockQuery.mockRejectedValueOnce(err)

      await expect(
        recordConversionEvent('tenant-1', 'RESTAURANT', 'OPEN_UPGRADE', {})
      ).resolves.toBeUndefined()
    })
  })
})
