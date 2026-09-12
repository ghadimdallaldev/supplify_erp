import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertInvoiceTenantAccess } from './invoice-access.js'
import { NotFoundError } from '../middlewares/errorHandler.js'

vi.mock('./tenant-resolve.js', () => ({
  requireSupplierId: vi.fn().mockResolvedValue('sup-1'),
  requireRestaurantId: vi.fn().mockResolvedValue('rest-1'),
}))

describe('invoice-access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows admin without tenant check', async () => {
    const req = { userData: { role: 'ADMIN' } }
    await expect(assertInvoiceTenantAccess(req, { supplier_id: 'x', restaurant_id: 'y' })).resolves
      .toBeUndefined
  })

  it('scopes an impersonating admin to the effective tenant', async () => {
    const req = {
      userData: { id: 'admin-1', role: 'ADMIN' },
      impersonationContext: {
        adminUserId: 'admin-1',
        tenantId: 'sup-1',
        tenantType: 'SUPPLIER',
      },
    }
    await expect(
      assertInvoiceTenantAccess(req, { supplier_id: 'sup-2', restaurant_id: 'rest-1' })
    ).rejects.toThrow(NotFoundError)
    await expect(
      assertInvoiceTenantAccess(req, { supplier_id: 'sup-1', restaurant_id: 'rest-1' })
    ).resolves.toBeUndefined()
  })

  it('blocks supplier from other supplier invoice', async () => {
    const { requireSupplierId } = await import('./tenant-resolve.js')
    vi.mocked(requireSupplierId).mockResolvedValue('sup-1')
    const req = { userData: { role: 'SUPPLIER' } }
    await expect(
      assertInvoiceTenantAccess(req, { supplier_id: 'sup-2', restaurant_id: 'r1' })
    ).rejects.toThrow(NotFoundError)
  })

  it('blocks restaurant from other restaurant invoice', async () => {
    const { requireRestaurantId } = await import('./tenant-resolve.js')
    vi.mocked(requireRestaurantId).mockResolvedValue('rest-1')
    const req = { userData: { role: 'RESTAURANT' } }
    await expect(
      assertInvoiceTenantAccess(req, { supplier_id: 's1', restaurant_id: 'rest-2' })
    ).rejects.toThrow(NotFoundError)
  })
})
