import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const featureMock = vi.fn()
const supplierColumnMock = vi.fn()
const billingTenantMock = vi.fn()

vi.mock('../lib/db.js', () => ({ query: (...args) => queryMock(...args) }))
vi.mock('../lib/subscription.js', () => ({ isFeatureEnabled: (...args) => featureMock(...args) }))
vi.mock('../lib/org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: (...args) => billingTenantMock(...args),
}))
vi.mock('../lib/warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: (...args) => supplierColumnMock(...args),
  isDefaultWarehouse: vi.fn(),
}))

import { supplierUsesWarehouseInventory } from './supplier-stock.service.js'

describe('supplier stock source of truth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    billingTenantMock.mockResolvedValue('billing-1')
    supplierColumnMock.mockResolvedValue('supplier_id')
  })

  it('requires both the feature and an active warehouse', async () => {
    featureMock.mockResolvedValue(true)
    queryMock.mockResolvedValueOnce({ rows: [{ c: 0 }] })
    await expect(supplierUsesWarehouseInventory('supplier-1')).resolves.toBe(false)

    queryMock.mockResolvedValueOnce({ rows: [{ c: 1 }] })
    await expect(supplierUsesWarehouseInventory('supplier-1')).resolves.toBe(true)
  })

  it('does not enable warehouse mode from an active warehouse alone', async () => {
    featureMock.mockResolvedValue(false)
    queryMock.mockResolvedValueOnce({ rows: [{ c: 1 }] })
    await expect(supplierUsesWarehouseInventory('supplier-1')).resolves.toBe(false)
  })
})
