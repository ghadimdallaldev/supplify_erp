import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCacheMock = vi.fn()
const setCacheMock = vi.fn()
const deleteCacheMock = vi.fn()

vi.mock('./cache.js', () => ({
  getCache: (...args) => getCacheMock(...args),
  setCache: (...args) => setCacheMock(...args),
  deleteCache: (...args) => deleteCacheMock(...args),
}))

describe('staff list cache', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    getCacheMock.mockResolvedValue(null)
    setCacheMock.mockResolvedValue(undefined)
    deleteCacheMock.mockResolvedValue(undefined)
    const { resetSingleflightForTests } = await import('./singleflight.js')
    resetSingleflightForTests()
  })

  it('loads and caches staff list data', async () => {
    const { cachedStaffList, staffListCacheKey } = await import('./staff-list-cache.js')
    const loader = vi.fn().mockResolvedValue([{ id: '1' }])

    const data = await cachedStaffList('pto', 'r1', null, loader)
    expect(data).toEqual([{ id: '1' }])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(setCacheMock).toHaveBeenCalledWith(staffListCacheKey('pto', 'r1'), [{ id: '1' }], 45)
  })

  it('invalidates all staff list keys for a restaurant', async () => {
    const { invalidateStaffListCache } = await import('./staff-list-cache.js')
    await invalidateStaffListCache('r1')
    expect(deleteCacheMock).toHaveBeenCalled()
    expect(deleteCacheMock.mock.calls.some((call) => String(call[0]).includes('r1'))).toBe(true)
  })
})
