import { describe, expect, it } from 'vitest'
import {
  resolveWarehouseForItem,
  simulateWarehouseRouting,
  buildSimulationFromPayload,
  restaurantMatchesZone,
  resolveSingleWarehouseForOrder,
  assignWarehousesToOrder,
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

  describe('restaurantMatchesZone', () => {
    it('matches postal codes and fails closed without a code', () => {
      const zone = { zone_type: 'postal_codes', postal_codes: ['1100', '1200'] }
      expect(restaurantMatchesZone(zone, { postalCode: '1100' })).toBe(true)
      expect(restaurantMatchesZone(zone, { postalCode: ' 1100 ' })).toBe(true)
      expect(
        restaurantMatchesZone(
          { zone_type: 'postal_codes', postal_codes: 'sw1a 1aa, 1100' },
          { postalCode: 'SW1A1AA' }
        )
      ).toBe(true)
      expect(
        restaurantMatchesZone(
          { zone_type: 'postal_codes', postal_codes: ['SW1', 'E1'] },
          { postalCode: 'SW1A 1AA' }
        )
      ).toBe(true)
      expect(
        restaurantMatchesZone(
          { zone_type: 'postal_codes', postal_codes: ['E1'] },
          { postalCode: 'E1 6AN' }
        )
      ).toBe(true)
      expect(
        restaurantMatchesZone(
          { zone_type: 'postal_codes', postal_codes: ['SW1'] },
          { postalCode: 'SW10 1AA' }
        )
      ).toBe(false)
      expect(restaurantMatchesZone(zone, { zip: '9999' })).toBe(false)
      expect(restaurantMatchesZone(zone, {})).toBe(false)
    })

    it('matches radius zones with haversine and fails closed without coords', () => {
      const zone = {
        zone_type: 'radius',
        center_lat: 33.89,
        center_lng: 35.5,
        radius_km: 5,
      }
      expect(restaurantMatchesZone(zone, { lat: 33.9, lng: 35.51 })).toBe(true)
      expect(
        restaurantMatchesZone(zone, { deliveryLatitude: 33.9, deliveryLongitude: 35.51 })
      ).toBe(true)
      expect(restaurantMatchesZone(zone, { lat: 34.5, lng: 36.5 })).toBe(false)
      expect(restaurantMatchesZone(zone, {})).toBe(false)
    })

    it('does not treat presence of geometry alone as a match', () => {
      const zone = {
        zone_type: 'polygon',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [35.4, 33.8],
              [35.6, 33.8],
              [35.6, 34.0],
              [35.4, 34.0],
              [35.4, 33.8],
            ],
          ],
        },
      }
      expect(restaurantMatchesZone(zone, {})).toBe(false)
      expect(restaurantMatchesZone(zone, { lat: 33.9, lng: 35.5 })).toBe(true)
      expect(restaurantMatchesZone(zone, { lat: 32.0, lng: 35.5 })).toBe(false)
    })

    it('uses polygon geometry when a polygon zone also has radius fields', () => {
      const zone = {
        zone_type: 'polygon',
        radius_km: 1,
        center_lat: 33.89,
        center_lng: 35.5,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [35.4, 33.8],
              [35.6, 33.8],
              [35.6, 34.0],
              [35.4, 34.0],
              [35.4, 33.8],
            ],
          ],
        },
      }
      expect(restaurantMatchesZone(zone, { lat: 33.95, lng: 35.55 })).toBe(true)
    })

    it('excludes points that sit in a polygon hole', () => {
      const zone = {
        zone_type: 'polygon',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [35.4, 33.8],
              [35.6, 33.8],
              [35.6, 34.0],
              [35.4, 34.0],
              [35.4, 33.8],
            ],
            [
              [35.48, 33.88],
              [35.52, 33.88],
              [35.52, 33.92],
              [35.48, 33.92],
              [35.48, 33.88],
            ],
          ],
        },
      }
      expect(restaurantMatchesZone(zone, { lat: 33.9, lng: 35.5 })).toBe(false)
      expect(restaurantMatchesZone(zone, { lat: 33.85, lng: 35.45 })).toBe(true)
    })

    it('excludes points that sit in a rings-format hole', () => {
      const zone = {
        zone_type: 'polygon',
        geometry: {
          rings: [
            [
              [35.4, 33.8],
              [35.6, 33.8],
              [35.6, 34.0],
              [35.4, 34.0],
              [35.4, 33.8],
            ],
            [
              [35.48, 33.88],
              [35.52, 33.88],
              [35.52, 33.92],
              [35.48, 33.92],
              [35.48, 33.88],
            ],
          ],
        },
      }
      expect(restaurantMatchesZone(zone, { lat: 33.9, lng: 35.5 })).toBe(false)
      expect(restaurantMatchesZone(zone, { lat: 33.85, lng: 35.45 })).toBe(true)
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

  describe('resolveSingleWarehouseForOrder', () => {
    it('selects one warehouse that can fulfill every line', () => {
      const result = resolveSingleWarehouseForOrder(
        [
          { product_id: 'p1', quantity: 2, category_id: 'c1' },
          { product_id: 'p2', quantity: 1, category_id: 'c2' },
        ],
        {
          warehouses: [
            { id: 'wh-east', is_active: true },
            { id: 'wh-west', is_active: true, is_default: true },
          ],
          warehouseStock: new Map([
            ['wh-east:p1', { quantity_available: 2 }],
            ['wh-east:p2', { quantity_available: 0 }],
            ['wh-west:p1', { quantity_available: 2 }],
            ['wh-west:p2', { quantity_available: 1 }],
          ]),
        }
      )

      expect(result).toMatchObject({
        warehouseId: 'wh-west',
        ruleType: 'configured_priority',
      })
    })

    it('rejects a basket that would require split fulfillment', () => {
      expect(() =>
        resolveSingleWarehouseForOrder(
          [
            { product_id: 'p1', quantity: 1 },
            { product_id: 'p2', quantity: 1 },
          ],
          {
            warehouses: [
              { id: 'wh-east', is_active: true },
              { id: 'wh-west', is_active: true },
            ],
            warehouseStock: new Map([
              ['wh-east:p1', { quantity_available: 1 }],
              ['wh-west:p2', { quantity_available: 1 }],
            ]),
          }
        )
      ).toThrowError(expect.objectContaining({ code: 'NO_SINGLE_FULFILLMENT_LOCATION' }))
    })

    it('fails a warehouse outside the service zone even when stock is available', () => {
      expect(() =>
        resolveSingleWarehouseForOrder([{ product_id: 'p1', quantity: 1 }], {
          warehouses: [{ id: 'wh-east', is_active: true }],
          warehouseStock: new Map([['wh-east:p1', { quantity_available: 5 }]]),
          zoneEligibleByWarehouse: new Map([['wh-east', false]]),
        })
      ).toThrowError(expect.objectContaining({ code: 'NO_SINGLE_FULFILLMENT_LOCATION' }))
    })

    it('ignores a product rule whose warehouse is inactive', () => {
      const result = resolveSingleWarehouseForOrder([{ product_id: 'p1', quantity: 1 }], {
        warehouses: [{ id: 'wh-east', is_active: true }],
        rules: [
          {
            id: 'r-old',
            rule_type: 'product',
            product_id: 'p1',
            warehouse_id: 'wh-closed',
            is_active: true,
          },
        ],
        warehouseStock: new Map([['wh-east:p1', { quantity_available: 5 }]]),
      })
      expect(result.warehouseId).toBe('wh-east')
    })
  })

  it('zone rule matches only the rule zone, not any zone of the warehouse', () => {
    const result = resolveWarehouseForItem(
      { product_id: 'p1', quantity: 1 },
      baseContext({
        rules: [
          {
            id: 'r-zone-b',
            rule_type: 'zone',
            zone_id: 'zone-b',
            warehouse_id: 'wh-east',
            is_active: true,
          },
        ],
        restaurantInZoneByWarehouse: new Map([['wh-east', true]]),
        restaurantZoneIds: new Set(['zone-a']),
        defaultWarehouseId: 'wh-default',
      })
    )
    expect(result.warehouseId).toBe('wh-default')
    expect(result.ruleType).toBe('default')
  })
})

describe('assignWarehousesToOrder stock lock', () => {
  it('locks inventory rows before choosing the warehouse', async () => {
    const calls = []
    const client = {
      query: async (sql) => {
        const text = String(sql)
        calls.push(text)
        if (text.includes('information_schema')) return { rows: [{ column_name: 'supplier_id' }] }
        if (text.includes('warehouse_inventory') && text.includes('FOR UPDATE OF wi')) {
          return { rows: [{ warehouse_id: 'wh-1', product_id: 'p1', quantity_available: 5 }] }
        }
        if (text.includes('warehouse_inventory') && text.includes('FOR UPDATE')) {
          return { rows: [{ product_id: 'p1', quantity_available: 5 }] }
        }
        if (text.includes('UPDATE warehouse_inventory')) return { rowCount: 1, rows: [] }
        if (text.includes('warehouse_routing_rule')) return { rows: [] }
        if (text.includes('FROM product')) {
          return { rows: [{ id: 'p1', supplier_id: 's1', category_id: null }] }
        }
        if (text.includes('FROM warehouse')) {
          return { rows: [{ id: 'wh-1', is_active: true, is_default: true }] }
        }
        if (text.includes('delivery_zone')) return { rows: [] }
        if (text.includes('INSERT INTO order_warehouse_assignment')) {
          return { rows: [{ id: 'owa-1', warehouse_id: 'wh-1' }] }
        }
        return { rows: [] }
      },
    }

    await assignWarehousesToOrder(client, {
      order: { id: 'o1', restaurant_id: 'r1' },
      orderItems: [{ product_id: 'p1', quantity: 2 }],
      supplier: { id: 's1' },
    })

    const choiceAt = calls.findIndex((sql) => sql.includes('FOR UPDATE OF wi'))
    const reserveAt = calls.findIndex(
      (sql, index) =>
        index > choiceAt && sql.includes('FOR UPDATE') && !sql.includes('FOR UPDATE OF wi')
    )
    expect(choiceAt).toBeGreaterThanOrEqual(0)
    expect(reserveAt).toBeGreaterThan(choiceAt)
  })
})
