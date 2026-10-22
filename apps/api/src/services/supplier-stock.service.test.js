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
  seedMissingWarehouseInventoryForSupplier,
  supplierUsesWarehouseInventory,
} from './supplier-stock.service.js'

describe('supplier stock source of truth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    billingTenantMock.mockResolvedValue('billing-1')
    supplierColumnMock.mockResolvedValue('supplier_id')
  })

  it('requires a warehouses/multi_warehouse feature and an active warehouse', async () => {
    featureMock.mockResolvedValue(true)
    queryMock.mockResolvedValueOnce({ rows: [{ c: 0 }] })
    await expect(supplierUsesWarehouseInventory('supplier-1')).resolves.toBe(false)

    queryMock.mockResolvedValueOnce({ rows: [{ c: 1 }] })
    await expect(supplierUsesWarehouseInventory('supplier-1')).resolves.toBe(true)
  })

  it('enables warehouse mode with the warehouses feature alone (single-WH Silver)', async () => {
    // Promise.all([warehouses, multi_warehouse]) — first true, second false
    featureMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    queryMock.mockResolvedValueOnce({ rows: [{ c: 1 }] })
    await expect(supplierUsesWarehouseInventory('supplier-1')).resolves.toBe(true)
  })

  it('does not enable warehouse mode without warehouses/multi_warehouse feature', async () => {
    featureMock.mockResolvedValue(false)
    queryMock.mockResolvedValueOnce({ rows: [{ c: 1 }] })
    await expect(supplierUsesWarehouseInventory('supplier-1')).resolves.toBe(false)
  })

  it('overlays warehouse qty and fail-closes missing rows', async () => {
    // overlay -> supplierUsesWarehouseInventory (warehouses + multi_warehouse)
    featureMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    queryMock
      .mockResolvedValueOnce({ rows: [{ c: 1 }] })
      // listSupplierStockDisplay -> supplierUsesWarehouseInventory
      .mockResolvedValueOnce({ rows: [{ c: 1 }] })
      // listSupplierStockDisplay warehouse aggregate (only product a)
      .mockResolvedValueOnce({
        rows: [{ product_id: 'a', available_qty: 7, reserved_qty: 0, on_hand_qty: 7 }],
      })
    // listSupplierStockDisplay also calls supplierUsesWarehouseInventory
    featureMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    const rows = await overlayProductRowsWithAuthoritativeStock([
      { id: 'a', supplier_id: 's1', available_qty: 99 },
      { id: 'b', supplier_id: 's1', available_qty: 99 },
    ])

    expect(rows).toEqual([
      { id: 'a', supplier_id: 's1', available_qty: 7 },
      { id: 'b', supplier_id: 's1', available_qty: 0 },
    ])
  })

  it('heals a missing warehouse row without overwriting a concurrent reservation', async () => {
    const calls = []
    const client = {
      query: vi.fn(async (sql) => {
        const text = String(sql)
        calls.push(text)
        if (text.includes('NOT EXISTS')) {
          return { rows: [{ product_id: 'p1', available_qty: 10, reserved_qty: 1 }] }
        }
        if (text.includes('is_active = FALSE')) {
          return { rows: [] }
        }
        return { rows: [], rowCount: 0 }
      }),
    }

    const result = await seedMissingWarehouseInventoryForSupplier('supplier-1', 'wh-1', {
      client,
      productIds: ['p1'],
    })

    expect(result.seeded).toBe(1)
    const inactiveLock = calls.find((sql) => sql.includes('is_active = FALSE'))
    expect(inactiveLock).toMatch(/FOR UPDATE OF wi/)
    const insert = calls.find((sql) => sql.includes('INSERT INTO warehouse_inventory'))
    expect(insert).toMatch(/ON CONFLICT \(warehouse_id, product_id\) DO NOTHING/)
    expect(insert).not.toMatch(/DO UPDATE SET/)
  })
})
