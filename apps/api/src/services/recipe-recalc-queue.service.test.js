import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockCalculateRecipeCost = vi.fn()
const mockPersistRecipeCalculation = vi.fn()
const mockIsTenantUnlocked = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('./recipe-cost-engine.service.js', () => ({
  calculateRecipeCost: (...args) => mockCalculateRecipeCost(...args),
  persistRecipeCalculation: (...args) => mockPersistRecipeCalculation(...args),
}))

vi.mock('../lib/background-write-locks.js', () => ({
  isTenantUnlockedForBackgroundWrites: (...args) => mockIsTenantUnlocked(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

describe('recipe-recalc-queue background locks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsTenantUnlocked.mockResolvedValue(true)
    mockCalculateRecipeCost.mockResolvedValue({ totalRecipeCost: 12 })
    mockPersistRecipeCalculation.mockResolvedValue(undefined)
  })

  it('filters dirty recipe recalculation candidates to unlocked restaurants', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const { processRecipeRecalcQueue } = await import('./recipe-recalc-queue.service.js')
    const result = await processRecipeRecalcQueue()

    const scanSql = String(mockQuery.mock.calls[0][0])
    expect(scanSql).toContain('FROM subscription sub')
    expect(scanSql).toContain('sub.tenant_id = d.restaurant_id')
    expect(scanSql).toContain("sub.tenant_type = 'RESTAURANT'")
    expect(scanSql).toContain('sub.account_locked_at IS NULL')
    expect(result).toEqual({ processed: 0, errors: 0, skippedLocked: 0 })
  })

  it('keeps dirty rows queued when a restaurant locks after scan', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'dirty-1',
          restaurant_id: 'rest-locked',
          recipe_id: 'recipe-1',
          reason: 'data_change',
        },
      ],
    })
    mockIsTenantUnlocked.mockResolvedValueOnce(false)

    const { processRecipeRecalcQueue } = await import('./recipe-recalc-queue.service.js')
    const result = await processRecipeRecalcQueue()

    expect(mockIsTenantUnlocked).toHaveBeenCalledWith({
      tenantId: 'rest-locked',
      tenantType: 'RESTAURANT',
    })
    expect(result).toEqual({ processed: 0, errors: 0, skippedLocked: 1 })
    expect(mockPersistRecipeCalculation).not.toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it('processes and deletes unlocked dirty rows', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'dirty-1', restaurant_id: 'rest-1', recipe_id: 'recipe-1', reason: 'price_change' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'recipe-1', restaurant_id: 'rest-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { processRecipeRecalcQueue } = await import('./recipe-recalc-queue.service.js')
    const result = await processRecipeRecalcQueue()

    expect(result).toEqual({ processed: 1, errors: 0, skippedLocked: 0 })
    expect(mockCalculateRecipeCost).toHaveBeenCalledOnce()
    expect(mockPersistRecipeCalculation).toHaveBeenCalledOnce()
    expect(
      mockQuery.mock.calls.some((call) =>
        String(call[0]).includes('DELETE FROM recipe_recalc_dirty')
      )
    ).toBe(true)
  })
})
