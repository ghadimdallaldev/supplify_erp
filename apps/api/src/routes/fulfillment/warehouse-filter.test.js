import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/warehouse-helpers.js', () => ({
  assertWarehouseOwnedBySupplier: vi.fn().mockResolvedValue({ id: 'wh-1' }),
}))

import { assertWarehouseOwnedBySupplier } from '../../lib/warehouse-helpers.js'
import { warehouseFilterClause } from './fulfillment.helpers.js'
import { ValidationError } from '../../middlewares/errorHandler.js'

function mockReq(warehouseId) {
  return { query: warehouseId ? { warehouse_id: warehouseId } : {} }
}

describe('warehouseFilterClause', () => {
  beforeEach(() => {
    vi.mocked(assertWarehouseOwnedBySupplier).mockReset()
    vi.mocked(assertWarehouseOwnedBySupplier).mockResolvedValue({ id: 'wh-1' })
  })

  it('returns empty clause when no warehouse filter', async () => {
    const result = await warehouseFilterClause(mockReq(null), 'sup-1', 2)
    expect(result).toEqual({ clause: '', params: [], warehouseId: null })
    expect(assertWarehouseOwnedBySupplier).not.toHaveBeenCalled()
  })

  it('uses order-level EXISTS by default', async () => {
    const result = await warehouseFilterClause(mockReq('wh-1'), 'sup-1', 2)
    expect(result.warehouseId).toBe('wh-1')
    expect(result.params).toEqual(['wh-1'])
    expect(result.clause).toContain('owa.order_id = o.id')
    expect(result.clause).not.toContain('da.warehouse_assignment_id')
    expect(assertWarehouseOwnedBySupplier).toHaveBeenCalledWith('wh-1', 'sup-1')
  })

  it('scopes to driver assignment legs when mode is assignment', async () => {
    const result = await warehouseFilterClause(mockReq('wh-1'), 'sup-1', 2, {
      mode: 'assignment',
    })
    expect(result.clause).toContain('da.warehouse_assignment_id')
    expect(result.clause).toContain('da.id IS NULL')
    expect(result.params).toEqual(['wh-1'])
  })

  it('rejects a warehouse that is not owned by the supplier', async () => {
    vi.mocked(assertWarehouseOwnedBySupplier).mockRejectedValueOnce(
      new ValidationError('Warehouse not found for this supplier')
    )
    await expect(warehouseFilterClause(mockReq('wh-foreign'), 'sup-1', 2)).rejects.toMatchObject({
      name: 'ValidationError',
    })
  })
})
