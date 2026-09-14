import { describe, it, expect } from 'vitest'
import { warehouseFilterClause } from './fulfillment.helpers.js'

function mockReq(warehouseId) {
  return { query: warehouseId ? { warehouse_id: warehouseId } : {} }
}

describe('warehouseFilterClause', () => {
  it('returns empty clause when no warehouse filter', async () => {
    const result = await warehouseFilterClause(mockReq(null), 'sup-1', 2)
    expect(result).toEqual({ clause: '', params: [], warehouseId: null })
  })

  it('uses order-level EXISTS by default', async () => {
    const result = await warehouseFilterClause(mockReq('wh-1'), 'sup-1', 2)
    expect(result.warehouseId).toBe('wh-1')
    expect(result.params).toEqual(['wh-1'])
    expect(result.clause).toContain('owa.order_id = o.id')
    expect(result.clause).not.toContain('da.warehouse_assignment_id')
  })

  it('scopes to driver assignment legs when mode is assignment', async () => {
    const result = await warehouseFilterClause(mockReq('wh-1'), 'sup-1', 2, {
      mode: 'assignment',
    })
    expect(result.clause).toContain('da.warehouse_assignment_id')
    expect(result.clause).toContain('da.id IS NULL')
    expect(result.params).toEqual(['wh-1'])
  })
})
