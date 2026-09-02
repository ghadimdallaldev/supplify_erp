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

import {
  overlayProductRowsWithAuthoritativeStock,
  supplierUsesWarehouseInventory,
} from './supplier-stock.service.js'

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

  it('overlays warehouse qty and fail-closes missing rows', async () => {
    featureMock.mockResolvedValue(true)
    queryMock
      // overlay -> supplierUsesWarehouseInventory
      .mockResolvedValueOnce({ rows: [{ c: 1 }] })
      // listSupplierStockDisplay -> supplierUsesWarehouseInventory
      .mockResolvedValueOnce({ rows: [{ c: 1 }] })
      // listSupplierStockDisplay warehouse aggregate (only product a)
      .mockResolvedValueOnce({
        rows: [{ product_id: 'a', available_qty: 7, reserved_qty: 0, on_hand_qty: 7 }],
      })

    const rows = await overlayProductRowsWithAuthoritativeStock([
      { id: 'a', supplier_id: 's1', available_qty: 99 },
      { id: 'b', supplier_id: 's1', available_qty: 99 },
    ])

    expect(rows).toEqual([
      { id: 'a', supplier_id: 's1', available_qty: 7 },
      { id: 'b', supplier_id: 's1', available_qty: 0 },
    ])
  })
})
