import { describe, expect, it } from 'vitest'
import { branchZoneLateralSql, warehouseZoneLateralSql } from './delivery-zone-join.js'

describe('warehouseZoneLateralSql', () => {
  it('labels a delivery with a zone that matches the restaurant address', () => {
    const sql = warehouseZoneLateralSql({ supplierClause: ' AND dz.supplier_id = $1' })
    expect(sql).toMatch(/dz\.zone_type = 'postal_codes'/)
    expect(sql).toMatch(/dz\.zone_type = 'radius'/)
    expect(sql).toMatch(/delivery_location_snapshot->>'latitude'/)
    expect(sql).toMatch(/b\.delivery_latitude/)
    expect(sql).toMatch(/dz\.supplier_id = \$1/)
    expect(sql).not.toMatch(/ORDER BY dz\.updated_at DESC NULLS LAST\s+LIMIT 1/)
  })
})

describe('branchZoneLateralSql', () => {
  it('labels a branch delivery with a zone that matches the destination', () => {
    const sql = branchZoneLateralSql()
    expect(sql).toMatch(/dz\.branch_id = o\.branch_id/)
    expect(sql).toMatch(/dz\.zone_type = 'postal_codes'/)
    expect(sql).toMatch(/delivery_location_snapshot->>'latitude'/)
    expect(sql).not.toMatch(/ORDER BY dz\.updated_at DESC NULLS LAST\s+LIMIT 1/)
  })
})
