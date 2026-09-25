import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: vi.fn(),
}))

describe('assertWarehouseOwnedBySupplier', () => {
  beforeEach(async () => {
    queryMock.mockReset()
    const { __resetWarehouseColumnCacheForTests } = await import('./warehouse-helpers.js')
    __resetWarehouseColumnCacheForTests()
  })

  it('skips lookup when warehouseId is empty', async () => {
    const { assertWarehouseOwnedBySupplier } = await import('./warehouse-helpers.js')
    await expect(assertWarehouseOwnedBySupplier(null, 'sup-1')).resolves.toBeNull()
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('rejects a warehouse that is not owned by the supplier', async () => {
    const { assertWarehouseOwnedBySupplier } = await import('./warehouse-helpers.js')
    queryMock
      .mockResolvedValueOnce({ rows: [{ column_name: 'supplier_id' }] })
      .mockResolvedValueOnce({ rows: [] })

    await expect(assertWarehouseOwnedBySupplier('wh-foreign', 'sup-1')).rejects.toMatchObject({
      name: 'ValidationError',
      message: 'Warehouse not found for this supplier',
    })
  })
})
