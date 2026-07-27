import { describe, expect, it } from 'vitest'
import {
  resolveWarehouseForItem,
  simulateWarehouseRouting,
  buildSimulationFromPayload,
} from './warehouseRouting.js'

const warehouses = [
  { id: 'wh-default', is_active: true, is_default: true },
  { id: 'wh-east', is_active: true },
  { id: 'wh-west', is_active: true },
]

function baseContext(overrides = {}) {
  return {
    rules: [],
    warehouses,
    warehouseStock: new Map(),
    restaurantInZoneByWarehouse: new Map(),
    defaultWarehouseId: 'wh-default',
    ...overrides,
  }
}

describe('warehouseRouting', () => {
  describe('resolveWarehouseForItem', () => {
    it('uses default warehouse in single-warehouse style context', () => {
      const result = resolveWarehouseForItem({ product_id: 'p1', quantity: 2 }, baseContext())
      expect(result.warehouseId).toBe('wh-default')
      expect(result.ruleType).toBe('default')
    })

    it('product rule beats category rule', () => {
      const rules = [
        {
          id: 'r-cat',
          rule_type: 'category',
          category_id: 'cat-1',
          warehouse_id: 'wh-east',
          is_active: true,
          priority: 1,
        },
        {
          id: 'r-prod',
          rule_type: 'product',
          product_id: 'p1',
          warehouse_id: 'wh-west',
          is_active: true,
          priority: 2,
        },
      ]
      const result = resolveWarehouseForItem(
        { product_id: 'p1', category_id: 'cat-1', quantity: 1 },
        baseContext({ rules })
      )
      expect(result.warehouseId).toBe('wh-west')
      expect(result.ruleType).toBe('product')
    })

    it('category rule beats zone rule', () => {
      const rules = [
        {
          id: 'r-zone',
          rule_type: 'zone',
          zone_id: 'z1',
          warehouse_id: 'wh-east',
          is_active: true,
          priority: 1,
        },
        {
          id: 'r-cat',
          rule_type: 'category',
          category_id: 'cat-1',
          warehouse_id: 'wh-west',
          is_active: true,
          priority: 2,
        },
      ]
      const zoneMap = new Map([['wh-east', true]])
      const result = resolveWarehouseForItem(
        { product_id: 'p1', category_id: 'cat-1', quantity: 1 },
        baseContext({ rules, restaurantInZoneByWarehouse: zoneMap })
      )
      expect(result.warehouseId).toBe('wh-west')
      expect(result.ruleType).toBe('category')
    })

    it('stock_available skips warehouse with insufficient stock', () => {
      const rules = [
        {
          id: 'r-stock',
          rule_type: 'stock_available',
          warehouse_id: 'wh-east',
          is_active: true,
          priority: 1,
        },
        {
          id: 'r-stock2',
          rule_type: 'stock_available',
          warehouse_id: 'wh-west',
          is_active: true,
          priority: 2,
        },
      ]
      const stock = new Map([
        ['wh-east:p1', { quantity_available: 1 }],
        ['wh-west:p1', { quantity_available: 10 }],
      ])
      const result = resolveWarehouseForItem(
        { product_id: 'p1', quantity: 5 },
        baseContext({ rules, warehouseStock: stock })
      )
      expect(result.warehouseId).toBe('wh-west')
      expect(result.ruleType).toBe('stock_available')
    })

    it('falls back to default when no rules match', () => {
      const result = resolveWarehouseForItem(
        { product_id: 'p-unknown', quantity: 1 },
        baseContext({ rules: [], defaultWarehouseId: 'wh-default' })
      )
      expect(result.warehouseId).toBe('wh-default')
    })
  })

  describe('simulateWarehouseRouting', () => {
    it('returns preview without side effects', () => {
      const items = [{ product_id: 'p1', quantity: 2 }]
      const preview = simulateWarehouseRouting(items, baseContext())
      expect(preview).toHaveLength(1)
      expect(preview[0].warehouseId).toBe('wh-default')
      expect(preview[0].reason).toBeDefined()
    })

    it('buildSimulationFromPayload matches simulateWarehouseRouting', () => {
      const items = [{ product_id: 'p1', quantity: 1, category_id: 'c1' }]
      const built = buildSimulationFromPayload({
        items,
        rules: [],
        warehouses,
        warehouseStock: [],
        zones: [],
        restaurantPostalCode: null,
      })
      const direct = simulateWarehouseRouting(items, baseContext())
      expect(built[0].warehouseId).toBe(direct[0].warehouseId)
    })
  })
})
