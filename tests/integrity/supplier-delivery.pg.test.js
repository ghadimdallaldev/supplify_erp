import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const fault = vi.hoisted(() => ({ enrichment: false, hiddenTables: [], hiddenColumns: [] }))
vi.mock('../../apps/api/src/config/env.js', () => ({
  config: { NODE_ENV: 'test', APP_ENV: 'dev', GPS_TRACKING_ENABLED: false },
}))
vi.mock('../../apps/api/src/lib/ensure-delivery-schema.js', () => ({
  ensureDeliverySchema: vi.fn(),
}))
vi.mock('../../apps/api/src/lib/cache.js', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
}))
vi.mock('../../apps/api/src/services/driver-location.service.js', () => ({
  isGpsTrackingEnabled: () => false,
  getLatestLocationsForDrivers: vi.fn(),
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const target = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (target.hostname !== '127.0.0.1' || target.pathname !== '/rbac_audit')
    throw new Error('Refusing non-isolated delivery audit database')
  const pool = new Pool({ connectionString: target.href, max: 4 })
  const query = vi.fn(async (sql, params) => {
    if (fault.enrichment && sql.includes('r.address_json AS restaurant_address')) {
      throw Object.assign(new Error('Simulated unavailable enrichment column'), { code: '42703' })
    }
    const result = await pool.query(sql, params)
    if (sql.includes('information_schema.tables'))
      result.rows = result.rows.filter((row) => !fault.hiddenTables.includes(row.table_name))
    if (sql.includes('information_schema.columns'))
      result.rows = result.rows.filter(
        (row) =>
          !fault.hiddenTables.includes(row.table_name) &&
          !fault.hiddenColumns.includes(`${row.table_name}.${row.column_name}`)
      )
    return result
  })
  return { pool, query, migrationQuery: query }
})

import { pool } from '../../apps/api/src/lib/db.js'
import { getSupplierDeliveryBoard } from '../../apps/api/src/services/supplier-deliveries.service.js'

afterAll(() => pool.end())
beforeEach(() => {
  fault.enrichment = false
  fault.hiddenTables = []
  fault.hiddenColumns = []
})

async function fixture(city = 'North') {
  const ids = Object.fromEntries(
    [
      'supplier',
      'otherSupplier',
      'restaurant',
      'product',
      'otherProduct',
      'driver',
      'secondDriver',
      'otherDriver',
    ].map((key) => [key, randomUUID()])
  )
  for (const id of [ids.supplier, ids.otherSupplier])
    await pool.query('INSERT INTO supplier(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [id])
  await pool.query(
    'INSERT INTO restaurant(id,name,slug,address_json) VALUES($1::uuid,$1::text,$1::text,$2)',
    [ids.restaurant, { city }]
  )
  for (const [id, supplier] of [
    [ids.product, ids.supplier],
    [ids.otherProduct, ids.otherSupplier],
  ]) {
    await pool.query(
      'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
      [id, supplier]
    )
  }
  for (const [id, supplier] of [
    [ids.driver, ids.supplier],
    [ids.secondDriver, ids.supplier],
    [ids.otherDriver, ids.otherSupplier],
  ]) {
    await pool.query('INSERT INTO drivers(id,supplier_id,full_name) VALUES($1,$2,$3)', [
      id,
      supplier,
      `Driver ${id}`,
    ])
  }
  async function order(supplier, product, driver, deliveryStatus) {
    const id = randomUUID(),
      assignment = driver ? randomUUID() : null
    await pool.query(
      `INSERT INTO customer_order(id,restaurant_id,status,total_amount,currency,requested_delivery_date)
      VALUES($1,$2,$3,5,'USD','2026-11-18')`,
      [id, ids.restaurant, deliveryStatus === 'delivered' ? 'DELIVERED' : 'SHIPPED']
    )
    await pool.query(
      'INSERT INTO order_item(order_id,product_id,supplier_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,5,5)',
      [id, product, supplier]
    )
    if (driver)
      await pool.query(
        `INSERT INTO driver_assignments(id,order_id,supplier_id,driver_id,status,scheduled_delivery_date)
      VALUES($1,$2,$3,$4,$5,'2026-11-18')`,
        [assignment, id, supplier, driver, deliveryStatus]
      )
    return { id, assignment }
  }
  ids.mine = await order(ids.supplier, ids.product, ids.driver, 'out_for_delivery')
  ids.otherDriverOrder = await order(
    ids.supplier,
    ids.product,
    ids.secondDriver,
    'out_for_delivery'
  )
  ids.delivered = await order(ids.supplier, ids.product, ids.driver, 'delivered')
  ids.unassigned = await order(ids.supplier, ids.product, null, null)
  ids.foreign = await order(
    ids.otherSupplier,
    ids.otherProduct,
    ids.otherDriver,
    'out_for_delivery'
  )
  return ids
}

describe('supplier delivery board real SQL and degraded enrichment', () => {
  it('returns the literal scheduled calendar day from PostgreSQL DATE values', async () => {
    const ids = await fixture()
    const board = await getSupplierDeliveryBoard(ids.supplier, {
      date: '2026-11-18',
      driverId: ids.driver,
      status: 'active_delivery',
    })
    expect(board.orders).toHaveLength(1)
    expect(board.orders[0]).toMatchObject({
      orderId: ids.mine.id,
      assignmentId: ids.mine.assignment,
      driverId: ids.driver,
      deliveryStatus: 'out_for_delivery',
      scheduledDeliveryDate: '2026-11-18',
    })
  })

  it('keeps real assignments and statuses when optional enrichment fails', async () => {
    const ids = await fixture()
    fault.enrichment = true
    const board = await getSupplierDeliveryBoard(ids.supplier, { date: '2026-11-18' })
    expect(board.orders).toHaveLength(4)
    expect(board.orders.find((row) => row.orderId === ids.mine.id)).toMatchObject({
      assignmentId: ids.mine.assignment,
      driverId: ids.driver,
      deliveryStatus: 'out_for_delivery',
    })
    expect(board.orders.find((row) => row.orderId === ids.delivered.id).deliveryStatus).toBe(
      'delivered'
    )
    expect(board.orders.some((row) => row.orderId === ids.foreign.id)).toBe(false)
    expect(board.stats).toMatchObject({ total: 4, outForDelivery: 2, delivered: 1, pending: 1 })
  })

  it('preserves driver, date, status and area filters on the fallback path', async () => {
    const ids = await fixture()
    fault.enrichment = true
    const board = await getSupplierDeliveryBoard(ids.supplier, {
      date: '2026-11-18',
      driverId: ids.driver,
      status: 'active_delivery',
      area: 'North',
    })
    expect(board.orders.map((row) => row.orderId)).toEqual([ids.mine.id])
    expect(board.orders[0].deliveryArea).toBe('North')
    expect(board.filters.driverId).toBe(ids.driver)
  })

  it.each(['constructor', '__proto__', 'toString'])(
    'groups the legal area name %s without Object prototype collisions',
    async (area) => {
      const ids = await fixture(area)
      const board = await getSupplierDeliveryBoard(ids.supplier, { date: '2026-11-18' })
      expect(board.byArea[area]).toHaveLength(4)
      expect(board.routeSummary).toEqual([expect.objectContaining({ area, orderCount: 4 })])
    }
  )

  it('retains assignments and driver scoping when driver display metadata is absent', async () => {
    const ids = await fixture()
    fault.hiddenTables = ['drivers']
    const board = await getSupplierDeliveryBoard(ids.supplier, {
      date: '2026-11-18',
      driverId: ids.driver,
      status: 'active_delivery',
    })
    expect(board.orders).toHaveLength(1)
    expect(board.orders[0]).toMatchObject({
      orderId: ids.mine.id,
      driverId: ids.driver,
      driverName: null,
      assignmentId: ids.mine.assignment,
    })
  })

  it('uses requested dates when optional assignment date columns are absent', async () => {
    const ids = await fixture()
    fault.hiddenColumns = [
      'driver_assignments.scheduled_delivery_date',
      'driver_assignments.assigned_at',
    ]
    const board = await getSupplierDeliveryBoard(ids.supplier, {
      date: '2026-11-18',
      driverId: ids.driver,
      status: 'active_delivery',
    })
    expect(board.orders[0]).toMatchObject({
      orderId: ids.mine.id,
      scheduledDeliveryDate: '2026-11-18',
    })
  })

  it('does not broaden a driver filter when assignment tables are unavailable in the schema probe', async () => {
    const ids = await fixture()
    fault.hiddenTables = ['drivers', 'driver_assignments']
    const board = await getSupplierDeliveryBoard(ids.supplier, {
      date: '2026-11-18',
      driverId: ids.driver,
    })
    expect(board.orders).toEqual([])
  })

  it('retains route dates even on legacy schemas with no driver assignment tables', async () => {
    const ids = await fixture(),
      route = randomUUID()
    await pool.query(
      `INSERT INTO delivery_route(id,supplier_id,route_number,scheduled_date) VALUES($1::uuid,$2,$1::text,'2026-11-19')`,
      [route, ids.supplier]
    )
    await pool.query('INSERT INTO route_stop(route_id,order_id,sequence_number) VALUES($1,$2,1)', [
      route,
      ids.mine.id,
    ])
    fault.hiddenTables = ['drivers', 'driver_assignments']
    const board = await getSupplierDeliveryBoard(ids.supplier, { date: '2026-11-19' })
    expect(board.orders).toHaveLength(1)
    expect(board.orders[0]).toMatchObject({
      orderId: ids.mine.id,
      scheduledDeliveryDate: '2026-11-19',
      assignmentId: null,
    })
  })
})
