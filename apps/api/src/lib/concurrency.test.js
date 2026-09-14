import { describe, expect, it, vi } from 'vitest'
import { mapWithConcurrency } from './concurrency.js'

describe('mapWithConcurrency', () => {
  it('returns empty array for empty input', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([])
  })

  it('preserves result order', async () => {
    const items = [1, 2, 3, 4, 5]
    const results = await mapWithConcurrency(items, 2, async (n) => n * 2)
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  it('limits concurrent in-flight work', async () => {
    let inFlight = 0
    let maxInFlight = 0

    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (n) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return n
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(1)
  })

  it('isolates per-item failures when caller handles them', async () => {
    const fn = vi.fn(async (n) => {
      if (n === 2) throw new Error('fail')
      return n
    })

    await expect(mapWithConcurrency([1, 2, 3], 2, fn)).rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
