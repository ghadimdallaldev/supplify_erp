import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'

vi.mock('./rbac.js', () => ({
  getRestaurantIdForRequest: vi.fn(),
  getSupplierIdForRequest: vi.fn(),
}))

import { getRestaurantIdForRequest, getSupplierIdForRequest } from './rbac.js'
import { requireRestaurantId, requireSupplierId, requireTenantScope } from './tenant-resolve.js'

describe('tenant-resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requireRestaurantId returns id from active tenant', async () => {
    getRestaurantIdForRequest.mockResolvedValue('rest-1')
    const id = await requireRestaurantId({})
    expect(id).toBe('rest-1')
  })

  it('requireRestaurantId throws when tenant missing', async () => {
    getRestaurantIdForRequest.mockResolvedValue(null)
    await expect(requireRestaurantId({})).rejects.toThrow(ValidationError)
  })

  it('requireTenantScope prefers restaurant', async () => {
    getRestaurantIdForRequest.mockResolvedValue('rest-1')
    getSupplierIdForRequest.mockResolvedValue('sup-1')
    const scope = await requireTenantScope({})
    expect(scope).toEqual({ tenantId: 'rest-1', tenantType: 'RESTAURANT' })
  })

  it('requireSupplierId returns supplier id', async () => {
    getRestaurantIdForRequest.mockResolvedValue(null)
    getSupplierIdForRequest.mockResolvedValue('sup-9')
    const id = await requireSupplierId({})
    expect(id).toBe('sup-9')
  })
})
