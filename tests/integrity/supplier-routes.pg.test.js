import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ beforeTransaction: null, beforeCommit: null }))
vi.mock('../../apps/api/src/config/env.js', () => ({
  config: {
    NODE_ENV: 'test',
    APP_ENV: 'dev',
    DEFAULT_TENANT_TIMEZONE: 'Asia/Beirut',
    EMAIL_ENABLED: false,
  },
}))
vi.mock('../../apps/api/src/lib/cache.js', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
  deleteCacheByPrefix: vi.fn(async () => {}),
}))
vi.mock('../../apps/api/src/services/notification.service.js', () => ({
  notifyOrderStatusChange: vi.fn(),
  notifyDriverDeliveryMilestone: vi.fn(),
}))
vi.mock('../../apps/api/src/services/driver-location.service.js', () => ({
  getLatestLocationsForDrivers: vi.fn(async () => new Map()),
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const url = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/rbac_audit')
    throw new Error('Refusing non-isolated supplier route target')
  const pool = new Pool({ connectionString: url.href, max: 8 })
  const query = (sql, params) => pool.query(sql, params)
  const withTransaction = async (callback) => {
    const hook = hooks.beforeTransaction
    hooks.beforeTransaction = null
    if (hook) await hook()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL statement_timeout = '4000ms'")
      const result = await callback(client)
      if (hooks.beforeCommit) await hooks.beforeCommit()
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return { pool, query, withTransaction, migrationQuery: query }
})

import { pool } from '../../apps/api/src/lib/db.js'
import {
  buildDriverRouteFromAssignments,
  createDeliveryRoute,
  getDeliveryRoute,
  getDriverActiveRoute,
  addOrdersToPlannedRoute,
  removeOrderFromPlannedRoute,
  reorderRouteStops,
  updateDeliveryRoute,
  updateRouteStop,
  setNextRouteStop,
  cancelDeliveryRoute,
} from '../../apps/api/src/services/delivery-routes.service.js'
import { ValidationError, ForbiddenError } from '../../apps/api/src/middlewares/errorHandler.js'
import {
  completeDeliveryWithProof,
  updateDeliveryStatus,
} from '../../apps/api/src/services/driver-fulfillment.service.js'

afterAll(() => pool.end())
beforeEach(() => {
  hooks.beforeTransaction = null
  hooks.beforeCommit = null
})

async function fixture({ date = '2099-02-03' } = {}) {
  const ids = Object.fromEntries(
    ['supplier', 'restaurant', 'product', 'driver'].map((key) => [key, randomUUID()])
  )
  await pool.query('INSERT INTO supplier(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
    ids.supplier,
  ])
  await pool.query('INSERT INTO restaurant(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
    ids.restaurant,
  ])
  await pool.query(
    'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
    [ids.product, ids.supplier]
  )
  await pool.query('INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)', [
    ids.driver,
    ids.supplier,
  ])
  const order = async ({ status = 'PROCESSING', assigned = true } = {}) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO customer_order(id,restaurant_id,status,total_amount,currency,requested_delivery_date)
      VALUES($1,$2,$3::order_status,5,'USD',$4::date)`,
      [id, ids.restaurant, status, date]
    )
    await pool.query(
      'INSERT INTO order_item(order_id,product_id,supplier_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,5,5)',
      [id, ids.product, ids.supplier]
    )
    await pool.query(
      'UPDATE inventory SET available_qty=99,reserved_qty=reserved_qty+1 WHERE product_id=$1',
      [ids.product]
    )
    if (assigned)
      await pool.query(
        `INSERT INTO driver_assignments(order_id,supplier_id,driver_id,status,scheduled_delivery_date)
      VALUES($1,$2,$3,'assigned',$4::date)`,
        [id, ids.supplier, ids.driver, date]
      )
    return id
  }
  return { ...ids, order, date }
}

async function plannedRoute(ids, orderIds) {
  return createDeliveryRoute({
    supplierId: ids.supplier,
    driverId: ids.driver,
    orderIds,
    scheduledDate: ids.date,
  })
}

async function dispatchedWarehouseLeg(ids, orderId, driverId) {
  const warehouse = randomUUID(),
    leg = randomUUID()
  await pool.query(
    'INSERT INTO warehouse(id,supplier_id,tenant_id,name) VALUES($1::uuid,$2,$2,$1::text)',
    [warehouse, ids.supplier]
  )
  await pool.query(
    `INSERT INTO order_warehouse_assignment(id,order_id,warehouse_id,status) VALUES($1,$2,$3,'dispatched')`,
    [leg, orderId, warehouse]
  )
  const {
    rows: [assignment],
  } = await pool.query(
    `INSERT INTO driver_assignments(order_id,supplier_id,driver_id,warehouse_assignment_id,status,scheduled_delivery_date)
    VALUES($1,$2,$3,$4,'out_for_delivery',$5::date) RETURNING id`,
    [orderId, ids.supplier, driverId, leg, ids.date]
  )
  return { leg, assignment: assignment.id }
}

describe('supplier route lifecycle with real SQL', () => {
  it('hands over and activates only the previous route driver warehouse legs while another driver stays assigned', async () => {
    const ids = await fixture(),
      orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    const other = randomUUID(),
      replacement = randomUUID()
    for (const driver of [other, replacement])
      await pool.query(
        'INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)',
        [driver, ids.supplier]
      )
    await pool.query("UPDATE driver_assignments SET status='reassigned' WHERE order_id=$1", [
      orderId,
    ])
    const own = await dispatchedWarehouseLeg(ids, orderId, ids.driver),
      separate = await dispatchedWarehouseLeg(ids, orderId, other)
    await pool.query("UPDATE driver_assignments SET status='assigned' WHERE id=$1", [
      own.assignment,
    ])
    await pool.query(
      "UPDATE customer_order SET status='SHIPPED',legacy_stock_committed_at=now() WHERE id=$1",
      [orderId]
    )
    const changed = await updateDeliveryRoute(ids.supplier, route.id, {
      driverId: replacement,
      status: 'IN_PROGRESS',
    })
    expect(changed.driverId).toBe(replacement)
    expect(changed.status).toBe('IN_PROGRESS')
    expect(
      (await pool.query('SELECT status FROM driver_assignments WHERE id=$1', [own.assignment]))
        .rows[0].status
    ).toBe('reassigned')
    const { rows: replacementLegs } = await pool.query(
      "SELECT warehouse_assignment_id,status,scheduled_delivery_date::text AS day FROM driver_assignments WHERE order_id=$1 AND driver_id=$2 AND status <> 'reassigned'",
      [orderId, replacement]
    )
    expect(replacementLegs).toEqual([
      { warehouse_assignment_id: own.leg, status: 'assigned', day: ids.date },
    ])
    expect(
      (
        await pool.query('SELECT driver_id,status FROM driver_assignments WHERE id=$1', [
          separate.assignment,
        ])
      ).rows[0]
    ).toEqual({ driver_id: other, status: 'out_for_delivery' })
  })

  it('waits for every warehouse leg of the route driver before closing one aggregated stop', async () => {
    const ids = await fixture(),
      orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    await pool.query("UPDATE driver_assignments SET status='reassigned' WHERE order_id=$1", [
      orderId,
    ])
    const first = await dispatchedWarehouseLeg(ids, orderId, ids.driver),
      second = await dispatchedWarehouseLeg(ids, orderId, ids.driver)
    await pool.query(
      "UPDATE customer_order SET status='SHIPPED',legacy_stock_committed_at=now() WHERE id=$1",
      [orderId]
    )
    await pool.query("UPDATE delivery_route SET status='IN_PROGRESS' WHERE id=$1", [route.id])
    await pool.query("UPDATE route_stop SET status='IN_TRANSIT' WHERE route_id=$1", [route.id])
    await completeDeliveryWithProof({
      supplierId: ids.supplier,
      orderId,
      driverAssignmentId: first.assignment,
      recipientName: 'First receiver',
    })
    expect((await getDeliveryRoute(ids.supplier, route.id)).stops[0].status).toBe(
      'OUT_FOR_DELIVERY'
    )
    await completeDeliveryWithProof({
      supplierId: ids.supplier,
      orderId,
      driverAssignmentId: second.assignment,
      recipientName: 'Second receiver',
    })
    expect((await getDeliveryRoute(ids.supplier, route.id)).status).toBe('COMPLETED')
  })

  it('closes this driver route without completing an undelivered warehouse leg belonging to another driver', async () => {
    const ids = await fixture(),
      orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    const other = randomUUID()
    await pool.query('INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)', [
      other,
      ids.supplier,
    ])
    await pool.query("UPDATE driver_assignments SET status='reassigned' WHERE order_id=$1", [
      orderId,
    ])
    const own = await dispatchedWarehouseLeg(ids, orderId, ids.driver),
      foreign = await dispatchedWarehouseLeg(ids, orderId, other)
    await pool.query(
      "UPDATE customer_order SET status='SHIPPED',legacy_stock_committed_at=now() WHERE id=$1",
      [orderId]
    )
    await pool.query("UPDATE delivery_route SET status='IN_PROGRESS' WHERE id=$1", [route.id])
    await pool.query("UPDATE route_stop SET status='IN_TRANSIT' WHERE route_id=$1", [route.id])
    await completeDeliveryWithProof({
      supplierId: ids.supplier,
      orderId,
      driverAssignmentId: own.assignment,
      recipientName: 'Receiver',
    })
    expect((await getDeliveryRoute(ids.supplier, route.id)).status).toBe('COMPLETED')
    expect(
      (await pool.query('SELECT status FROM driver_assignments WHERE id=$1', [foreign.assignment]))
        .rows[0].status
    ).toBe('out_for_delivery')
    expect(
      (await pool.query('SELECT status FROM customer_order WHERE id=$1', [orderId])).rows[0].status
    ).toBe('SHIPPED')
  })

  it('rolls back proof, order, assignment, stop and route changes together when the transaction fails', async () => {
    const ids = await fixture(),
      orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    await updateDeliveryRoute(ids.supplier, route.id, { status: 'IN_PROGRESS' })
    await updateRouteStop(ids.supplier, route.id, route.stops[0].id, { status: 'OUT_FOR_DELIVERY' })
    const {
      rows: [assignment],
    } = await pool.query('SELECT id FROM driver_assignments WHERE order_id=$1', [orderId])
    hooks.beforeCommit = () => {
      throw new Error('Injected transaction failure')
    }
    await expect(
      completeDeliveryWithProof({
        supplierId: ids.supplier,
        orderId,
        driverAssignmentId: assignment.id,
        recipientName: 'Receiver',
      })
    ).rejects.toThrow('Injected transaction failure')
    hooks.beforeCommit = null
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM proof_of_delivery WHERE order_id=$1', [
          orderId,
        ])
      ).rows[0].count
    ).toBe(0)
    expect(
      (await pool.query('SELECT status FROM customer_order WHERE id=$1', [orderId])).rows[0].status
    ).toBe('SHIPPED')
    expect(
      (await pool.query('SELECT status FROM driver_assignments WHERE id=$1', [assignment.id]))
        .rows[0].status
    ).toBe('out_for_delivery')
    const unchanged = await getDeliveryRoute(ids.supplier, route.id)
    expect(unchanged.status).toBe('IN_PROGRESS')
    expect(unchanged.stops[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('preserves progress, completed stops, assignment history and stock during route driver handover', async () => {
    const ids = await fixture(),
      first = await ids.order(),
      second = await ids.order(),
      route = await plannedRoute(ids, [first, second])
    await updateDeliveryRoute(ids.supplier, route.id, { status: 'IN_PROGRESS' })
    await updateRouteStop(ids.supplier, route.id, route.stops[0].id, { status: 'OUT_FOR_DELIVERY' })
    const {
      rows: [done],
    } = await pool.query('SELECT id FROM driver_assignments WHERE order_id=$1', [first])
    await completeDeliveryWithProof({
      supplierId: ids.supplier,
      orderId: first,
      driverAssignmentId: done.id,
      recipientName: 'Receiver',
    })
    await updateRouteStop(ids.supplier, route.id, route.stops[1].id, { status: 'OUT_FOR_DELIVERY' })
    const stock = (
      await pool.query('SELECT available_qty,reserved_qty FROM inventory WHERE product_id=$1', [
        ids.product,
      ])
    ).rows
    const replacement = randomUUID()
    await pool.query('INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)', [
      replacement,
      ids.supplier,
    ])
    const changed = await updateDeliveryRoute(ids.supplier, route.id, { driverId: replacement })
    expect(changed.stops.map((stop) => stop.status)).toEqual(['DELIVERED', 'OUT_FOR_DELIVERY'])
    expect(
      (await pool.query('SELECT driver_id,status FROM driver_assignments WHERE id=$1', [done.id]))
        .rows[0]
    ).toEqual({ driver_id: ids.driver, status: 'delivered' })
    expect(
      (
        await pool.query(
          "SELECT driver_id,status FROM driver_assignments WHERE order_id=$1 AND status <> 'reassigned'",
          [second]
        )
      ).rows
    ).toEqual([{ driver_id: replacement, status: 'out_for_delivery' }])
    expect(
      (
        await pool.query('SELECT available_qty,reserved_qty FROM inventory WHERE product_id=$1', [
          ids.product,
        ])
      ).rows
    ).toEqual(stock)
  })

  it('keeps direct driver dispatch synchronized with its live route stop', async () => {
    const ids = await fixture(),
      orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    await updateDeliveryRoute(ids.supplier, route.id, { status: 'IN_PROGRESS' })
    const {
      rows: [assignment],
    } = await pool.query('SELECT id FROM driver_assignments WHERE order_id=$1', [orderId])
    await updateDeliveryStatus({
      supplierId: ids.supplier,
      orderId,
      driverAssignmentId: assignment.id,
      status: 'out_for_delivery',
    })
    const detail = await getDeliveryRoute(ids.supplier, route.id)
    expect(detail.stops[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('completes the live route stop and route when proof is captured through the direct driver endpoint', async () => {
    const ids = await fixture(),
      orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    await updateDeliveryRoute(ids.supplier, route.id, { status: 'IN_PROGRESS' })
    await updateRouteStop(ids.supplier, route.id, route.stops[0].id, { status: 'OUT_FOR_DELIVERY' })
    const {
      rows: [assignment],
    } = await pool.query('SELECT id FROM driver_assignments WHERE order_id=$1', [orderId])
    await completeDeliveryWithProof({
      supplierId: ids.supplier,
      orderId,
      driverAssignmentId: assignment.id,
      recipientName: 'Receiver',
    })
    const detail = await getDeliveryRoute(ids.supplier, route.id)
    expect(detail.stops[0].status).toBe('DELIVERED')
    expect(detail.status).toBe('COMPLETED')
  })

  it('rejects a stop transition when no matching assignment can perform it', async () => {
    const ids = await fixture(),
      orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    await updateDeliveryRoute(ids.supplier, route.id, { status: 'IN_PROGRESS' })
    await updateRouteStop(ids.supplier, route.id, route.stops[0].id, { status: 'OUT_FOR_DELIVERY' })
    await pool.query("UPDATE driver_assignments SET status='reassigned' WHERE order_id=$1", [
      orderId,
    ])
    await expect(
      updateRouteStop(ids.supplier, route.id, route.stops[0].id, { status: 'DELIVERED' })
    ).rejects.toBeInstanceOf(ValidationError)
    expect((await getDeliveryRoute(ids.supplier, route.id)).stops[0].status).toBe(
      'OUT_FOR_DELIVERY'
    )
  })

  it.each(['PLANNED', 'IN_PROGRESS'])(
    'changes the driver on a %s route together with its live assignments',
    async (routeStatus) => {
      const ids = await fixture(),
        orderId = await ids.order(),
        route = await plannedRoute(ids, [orderId])
      if (routeStatus === 'IN_PROGRESS')
        await updateDeliveryRoute(ids.supplier, route.id, { status: routeStatus })
      const driver = randomUUID()
      await pool.query(
        'INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)',
        [driver, ids.supplier]
      )
      const updated = await updateDeliveryRoute(ids.supplier, route.id, { driverId: driver })
      expect(updated.driverId).toBe(driver)
      const { rows: active } = await pool.query(
        "SELECT driver_id FROM driver_assignments WHERE order_id=$1 AND status IN ('assigned','picked_up','out_for_delivery','rescheduled')",
        [orderId]
      )
      expect(active).toEqual([{ driver_id: driver }])
    }
  )

  it('adds, reorders, selects next, removes and cancels a planned route without losing assignment scope', async () => {
    const ids = await fixture(),
      orders = [await ids.order(), await ids.order(), await ids.order()]
    const route = await plannedRoute(ids, orders.slice(0, 2))
    const added = await addOrdersToPlannedRoute({
      supplierId: ids.supplier,
      routeId: route.id,
      orderIds: [orders[2]],
    })
    expect(added.stops.map((stop) => stop.sequenceNumber)).toEqual([1, 2, 3])
    const reversed = await reorderRouteStops(
      ids.supplier,
      route.id,
      added.stops.map((stop) => stop.id).reverse()
    )
    expect(reversed.stops.map((stop) => stop.orderId)).toEqual([...orders].reverse())
    const next = await setNextRouteStop(ids.supplier, route.id, orders[0])
    expect(next.stops[0].orderId).toBe(orders[0])
    const removed = await removeOrderFromPlannedRoute({
      supplierId: ids.supplier,
      routeId: route.id,
      orderId: orders[1],
    })
    expect(removed.stops.map((stop) => stop.orderId)).not.toContain(orders[1])
    expect(
      (await pool.query('SELECT status FROM driver_assignments WHERE order_id=$1', [orders[1]]))
        .rows[0].status
    ).toBe('reassigned')
    expect((await cancelDeliveryRoute(ids.supplier, route.id)).status).toBe('CANCELLED')
    expect(
      (
        await pool.query(
          'SELECT DISTINCT status FROM driver_assignments WHERE order_id=ANY($1::uuid[])',
          [orders]
        )
      ).rows
    ).toEqual([{ status: 'reassigned' }])
  })

  it('starts, dispatches and delivers a route stop together with its assignment and order', async () => {
    const ids = await fixture(),
      orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    await updateDeliveryRoute(ids.supplier, route.id, { status: 'IN_PROGRESS' })
    const sent = await updateRouteStop(ids.supplier, route.id, route.stops[0].id, {
      status: 'OUT_FOR_DELIVERY',
      driverIdScope: ids.driver,
    })
    expect(sent.stops[0].status).toBe('OUT_FOR_DELIVERY')
    expect(
      (await pool.query('SELECT status FROM customer_order WHERE id=$1', [orderId])).rows[0].status
    ).toBe('SHIPPED')
    const delivered = await updateRouteStop(ids.supplier, route.id, route.stops[0].id, {
      status: 'DELIVERED',
      driverIdScope: ids.driver,
    })
    expect(delivered.status).toBe('COMPLETED')
    expect(delivered.stops[0].status).toBe('DELIVERED')
    expect(
      (await pool.query('SELECT status FROM driver_assignments WHERE order_id=$1', [orderId]))
        .rows[0].status
    ).toBe('delivered')
    expect(
      (await pool.query('SELECT status FROM customer_order WHERE id=$1', [orderId])).rows[0].status
    ).toBe('DELIVERED')
  })

  it('builds, commits and replays a driver route from two standalone assignments', async () => {
    const ids = await fixture()
    const orders = [await ids.order(), await ids.order()]
    const route = await buildDriverRouteFromAssignments(ids.supplier, ids.driver, {
      date: ids.date,
    })
    expect(route.stops.map((stop) => stop.orderId).sort()).toEqual([...orders].sort())
    expect(route.status).toBe('IN_PROGRESS')
    expect((await getDeliveryRoute(ids.supplier, route.id)).id).toBe(route.id)
    expect(
      (await buildDriverRouteFromAssignments(ids.supplier, ids.driver, { date: ids.date })).id
    ).toBe(route.id)
  })

  it('returns a route calendar day as a literal YYYY-MM-DD', async () => {
    const ids = await fixture()
    const route = await plannedRoute(ids, [await ids.order()])
    expect(route.scheduledDate).toBe(ids.date)
  })

  it('keeps the route driver assignment status and the actual order currency on its stops', async () => {
    const ids = await fixture(),
      orderId = await ids.order()
    const route = await plannedRoute(ids, [orderId])
    const otherDriver = randomUUID()
    await pool.query('INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)', [
      otherDriver,
      ids.supplier,
    ])
    await pool.query("UPDATE customer_order SET currency='LBP' WHERE id=$1", [orderId])
    await pool.query(
      `INSERT INTO driver_assignments(order_id,supplier_id,driver_id,status,created_at)
      VALUES($1,$2,$3,'delivered',now()+interval '1 second')`,
      [orderId, ids.supplier, otherDriver]
    )
    const detail = await getDeliveryRoute(ids.supplier, route.id)
    expect(detail.stops[0]).toMatchObject({
      totalAmount: 5,
      itemCount: 1,
      assignmentStatus: 'assigned',
      currency: 'LBP',
    })
  })

  it('finds a planned route on the supplier local day rather than the database day', async () => {
    const {
      rows: [clock],
    } = await pool.query(
      `SELECT CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date <> CURRENT_DATE THEN 'Pacific/Kiritimati' ELSE 'Pacific/Pago_Pago' END AS zone`
    )
    const {
      rows: [day],
    } = await pool.query('SELECT (now() AT TIME ZONE $1)::date::text AS day', [clock.zone])
    const ids = await fixture({ date: day.day })
    await pool.query('UPDATE supplier SET last_order_timezone=$2 WHERE id=$1', [
      ids.supplier,
      clock.zone,
    ])
    const planned = await plannedRoute(ids, [await ids.order()])
    expect((await getDriverActiveRoute(ids.supplier, ids.driver))?.id).toBe(planned.id)
  })

  it('builds the supplier local day when the driver omits a date at a UTC day boundary', async () => {
    const {
      rows: [clock],
    } = await pool.query(
      `SELECT CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date <> CURRENT_DATE THEN 'Pacific/Kiritimati' ELSE 'Pacific/Pago_Pago' END AS zone`
    )
    const {
      rows: [day],
    } = await pool.query('SELECT (now() AT TIME ZONE $1)::date::text AS day', [clock.zone])
    const ids = await fixture({ date: day.day })
    await pool.query('UPDATE supplier SET last_order_timezone=$2 WHERE id=$1', [
      ids.supplier,
      clock.zone,
    ])
    await ids.order()
    await ids.order()
    const built = await buildDriverRouteFromAssignments(ids.supplier, ids.driver)
    expect(built.scheduledDate).toBe(day.day)
    expect(built.stops).toHaveLength(2)
  })

  it('refuses to append orders when the planned route was cancelled after the precheck', async () => {
    const ids = await fixture()
    const route = await plannedRoute(ids, [await ids.order()])
    const extra = await ids.order()
    hooks.beforeTransaction = () =>
      pool.query("UPDATE delivery_route SET status='CANCELLED' WHERE id=$1", [route.id])
    await expect(
      addOrdersToPlannedRoute({ supplierId: ids.supplier, routeId: route.id, orderIds: [extra] })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM route_stop WHERE route_id=$1', [
          route.id,
        ])
      ).rows[0].count
    ).toBe(1)
  })

  it('does not plan an order cancelled while the create request was in flight', async () => {
    const ids = await fixture(),
      orderId = await ids.order()
    hooks.beforeTransaction = () =>
      pool.query("UPDATE customer_order SET status='CANCELLED' WHERE id=$1", [orderId])
    await expect(plannedRoute(ids, [orderId])).rejects.toBeInstanceOf(ValidationError)
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM delivery_route WHERE supplier_id=$1', [
          ids.supplier,
        ])
      ).rows[0].count
    ).toBe(0)
  })

  it('refuses to remove a stop when its route started after the precheck', async () => {
    const ids = await fixture()
    const orderId = await ids.order(),
      route = await plannedRoute(ids, [orderId])
    hooks.beforeTransaction = () =>
      pool.query("UPDATE delivery_route SET status='IN_PROGRESS' WHERE id=$1", [route.id])
    await expect(
      removeOrderFromPlannedRoute({ supplierId: ids.supplier, routeId: route.id, orderId })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM route_stop WHERE route_id=$1', [
          route.id,
        ])
      ).rows[0].count
    ).toBe(1)
  })

  it('refuses a stale reorder after the route has finished', async () => {
    const ids = await fixture()
    const route = await plannedRoute(ids, [await ids.order(), await ids.order()])
    const before = route.stops.map((stop) => stop.id)
    hooks.beforeTransaction = () =>
      pool.query("UPDATE delivery_route SET status='COMPLETED' WHERE id=$1", [route.id])
    await expect(
      reorderRouteStops(ids.supplier, route.id, [...before].reverse())
    ).rejects.toBeInstanceOf(ValidationError)
    expect(
      (
        await pool.query('SELECT id FROM route_stop WHERE route_id=$1 ORDER BY sequence_number', [
          route.id,
        ])
      ).rows.map((row) => row.id)
    ).toEqual(before)
  })

  it('does not activate a route cancelled after the initial read', async () => {
    const ids = await fixture()
    const route = await plannedRoute(ids, [await ids.order()])
    hooks.beforeTransaction = () =>
      pool.query("UPDATE delivery_route SET status='CANCELLED' WHERE id=$1", [route.id])
    await expect(
      updateDeliveryRoute(ids.supplier, route.id, { status: 'IN_PROGRESS' })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(
      (await pool.query('SELECT status FROM delivery_route WHERE id=$1', [route.id])).rows[0].status
    ).toBe('CANCELLED')
  })

  it('rechecks the driver scope inside a route-stop write after the route driver changes', async () => {
    const ids = await fixture(),
      route = await plannedRoute(ids, [await ids.order()])
    const replacement = randomUUID()
    await pool.query('INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)', [
      replacement,
      ids.supplier,
    ])
    await pool.query("UPDATE delivery_route SET status='IN_PROGRESS' WHERE id=$1", [route.id])
    hooks.beforeTransaction = () =>
      pool.query('UPDATE delivery_route SET driver_id=$2 WHERE id=$1', [route.id, replacement])
    await expect(
      updateRouteStop(ids.supplier, route.id, route.stops[0].id, {
        status: 'OUT_FOR_DELIVERY',
        driverIdScope: ids.driver,
      })
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(
      (await pool.query('SELECT status FROM route_stop WHERE id=$1', [route.stops[0].id])).rows[0]
        .status
    ).toBe('PLANNED')
  })
})
