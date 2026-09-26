import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteCacheByPrefixMock = vi.fn()

vi.mock('./cache.js', () => ({
  deleteCacheByPrefix: (...args) => deleteCacheByPrefixMock(...args),
}))

describe('dispatch cache', () => {
  beforeEach(() => {
    deleteCacheByPrefixMock.mockReset()
    deleteCacheByPrefixMock.mockResolvedValue(undefined)
  })

  it('invalidates the same versioned prefix the board writes', async () => {
    const { dispatchCacheKey, invalidateDispatchCacheForSupplier } = await import(
      './dispatch-cache.js'
    )
    const key = dispatchCacheKey('supplier-1', 14, 'wh-9')
    await invalidateDispatchCacheForSupplier('supplier-1')
    const prefix = deleteCacheByPrefixMock.mock.calls[0][0]
    expect(key.startsWith(prefix)).toBe(true)
    expect(prefix).toBe('fulfillment:dispatch:v2:supplier-1:')
  })

  it('covers the unfiltered warehouse variant', async () => {
    const { dispatchCacheKey, invalidateDispatchCacheForSupplier } = await import(
      './dispatch-cache.js'
    )
    const key = dispatchCacheKey('supplier-1', 14, null)
    await invalidateDispatchCacheForSupplier('supplier-1')
    const prefix = deleteCacheByPrefixMock.mock.calls[0][0]
    expect(key.startsWith(prefix)).toBe(true)
  })
})
