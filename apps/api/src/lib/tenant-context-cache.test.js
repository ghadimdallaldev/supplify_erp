import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
const getCacheMock = vi.fn()
const setCacheMock = vi.fn()
const deleteCacheMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('./cache.js', () => ({
  getCache: (...args) => getCacheMock(...args),
  setCache: (...args) => setCacheMock(...args),
  deleteCache: (...args) => deleteCacheMock(...args),
}))

vi.mock('./permissions.js', () => ({
  getRolesForUser: vi.fn().mockResolvedValue(['Owner']),
  getPermissionsForUser: vi.fn().mockResolvedValue(['STAFF_VIEW']),
}))

vi.mock('./impersonation.js', () => ({
  getEffectiveTenant: vi.fn().mockReturnValue(null),
}))

describe('tenant context cache', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    getCacheMock.mockResolvedValue(null)
    setCacheMock.mockResolvedValue(undefined)
    deleteCacheMock.mockResolvedValue(undefined)
    const { resetSingleflightForTests } = await import('./singleflight.js')
    resetSingleflightForTests()
  })

  it('caches roles and permissions bundle on miss', async () => {
    const { getTenantContextBundle, tenantContextCacheKey } = await import(
      './tenant-context-cache.js'
    )

    const bundle = await getTenantContextBundle('u1', 't1', 'RESTAURANT')
    expect(bundle.roles).toEqual(['Owner'])
    expect(bundle.permissions).toEqual(['STAFF_VIEW'])
    expect(setCacheMock).toHaveBeenCalledWith(
      tenantContextCacheKey('u1', 't1', 'RESTAURANT'),
      bundle,
      120
    )
  })

  it('returns cached bundle without recomputing', async () => {
    const cached = { roles: ['Viewer'], permissions: ['ORDERS_VIEW'] }
    getCacheMock.mockResolvedValueOnce(cached)
    const { getTenantContextBundle } = await import('./tenant-context-cache.js')
    const { getRolesForUser } = await import('./permissions.js')

    const bundle = await getTenantContextBundle('u1', 't1', 'RESTAURANT')
    expect(bundle).toEqual(cached)
    expect(getRolesForUser).not.toHaveBeenCalled()
  })

  it('canUseCrossRequestTenantCaches returns false when impersonating', async () => {
    const { getEffectiveTenant } = await import('./impersonation.js')
    vi.mocked(getEffectiveTenant).mockReturnValueOnce({ tenantId: 'x', tenantType: 'RESTAURANT' })
    const { canUseCrossRequestTenantCaches } = await import('./tenant-context-cache.js')

    expect(
      canUseCrossRequestTenantCaches({
        userData: { id: 'u1', role: 'ADMIN' },
        headers: {},
      })
    ).toBe(false)
  })
})
