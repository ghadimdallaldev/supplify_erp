import { describe, it, expect, vi, beforeEach } from 'vitest'
import { singleflight, resetSingleflightForTests } from './singleflight.js'

describe('singleflight', () => {
  beforeEach(() => {
    resetSingleflightForTests()
  })

  it('runs fn once for concurrent callers with the same key', async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return 'ok'
    })

    const [a, b, c] = await Promise.all([
      singleflight('k1', fn),
      singleflight('k1', fn),
      singleflight('k1', fn),
    ])

    expect(fn).toHaveBeenCalledTimes(1)
    expect(a).toBe('ok')
    expect(b).toBe('ok')
    expect(c).toBe('ok')
  })

  it('allows a new run after the prior promise settles', async () => {
    const fn = vi.fn(async () => 'v')
    await singleflight('k2', fn)
    await singleflight('k2', fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
