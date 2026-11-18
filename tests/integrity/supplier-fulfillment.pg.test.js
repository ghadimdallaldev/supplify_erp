import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ before: null, after: null }))
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
vi.mock('../../apps/api/src/services/storage/storage.service.js', () => ({
  buildObjectPublicUrl: (key) => `https://audit.invalid/${key}`,
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const url = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/rbac_audit')
    throw new Error('Refusing non-isolated fulfillment audit target')
  const pool = new Pool({ connectionString: url.href, max: 8 })
  const singlePool = new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 500 })
  const auditContext = new AsyncLocalStorage()
  const selectPool = () => (auditContext.getStore() === 'single-connection' ? singlePool : pool)
  const query = (sql, params) => selectPool().query(sql, params)
  const withTransaction = async (callback) => {
    const raw = await selectPool().connect(),
      label = auditContext.getStore()
    const client = {
      query: async (sql, params) => {
        if (hooks.before) await hooks.before(label, sql)
        const result = await raw.query(sql, params)
        if (hooks.after) await hooks.after(label, sql)
        return result
      },
    }
    try {
      await raw.query('BEGIN')
      await raw.query("SET LOCAL deadlock_timeout = '100ms'")
      await raw.query("SET LOCAL statement_timeout = '4000ms'")
      const result = await callback(client)
      await raw.query('COMMIT')
      return result
    } catch (error) {
      await raw.query('ROLLBACK')
      throw error
    } finally {
      raw.release()
    }
  }
  return { pool, singlePool, auditContext, query, withTransaction, migrationQuery: query }
})

import { pool, singlePool, auditContext } from '../../apps/api/src/lib/db.js'
import {
  assignDriverToOrder,
  completeDeliveryWithProof,
  reassignDriver,
  submitProofOfDelivery,
  updateDeliveryStatus,
} from '../../apps/api/src/services/driver-fulfillment.service.js'
import { ValidationError } from '../../apps/api/src/middlewares/errorHandler.js'
import { getDriverDeliveryDetail } from '../../apps/api/src/services/driver-delivery-detail.service.js'
import { assertDriverAssignmentAccess } from '../../apps/api/src/lib/driver-rbac.js'
import { PERMISSION_KEYS as P } from '../../apps/api/src/lib/permission-keys.js'
import {
  updateRouteStop,
  cancelDeliveryRoute,
} from '../../apps/api/src/services/delivery-routes.service.js'

afterAll(() => Promise.all([pool.end(), singlePool.end()]))
beforeEach(() => {
  hooks.before = null
  hooks.after = null
})

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function within(promise, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Barrier timed out: ${label}`)), 3000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function fixture({
  status = 'PROCESSING',
  assignmentStatus = 'assigned',
  podRequired = false,
  assigned = true,
  requestedDate = '2099-02-03',
} = {}) {
  const ids = Object.fromEntries(
    ['supplier', 'restaurant', 'product', 'order', 'driver', 'newDriver', 'assignment'].map(
      (key) => [key, randomUUID()]
    )
  )
  await pool.query(
    'INSERT INTO supplier(id,name,slug,pod_required) VALUES($1::uuid,$1::text,$1::text,$2)',
    [ids.supplier, podRequired]
  )
  await pool.query('INSERT INTO restaurant(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
    ids.restaurant,
  ])
  await pool.query(
    'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
    [ids.product, ids.supplier]
  )
  await pool.query('UPDATE inventory SET available_qty=9,reserved_qty=$2 WHERE product_id=$1', [
    ids.product,
    status === 'SHIPPED' ? 0 : 1,
  ])
  await pool.query(
    `INSERT INTO customer_order(id,restaurant_id,status,total_amount,currency,requested_delivery_date,legacy_stock_committed_at)
    VALUES($1,$2,$3::order_status,5,'USD',$4::date,CASE WHEN $3::text='SHIPPED' THEN now() ELSE NULL END)`,
    [ids.order, ids.restaurant, status, requestedDate]
  )
  await pool.query(
    'INSERT INTO order_item(order_id,product_id,supplier_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,5,5)',
    [ids.order, ids.product, ids.supplier]
  )
  for (const driver of [ids.driver, ids.newDriver])
    await pool.query('INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)', [
      driver,
      ids.supplier,
    ])
  if (assigned)
    await pool.query(
      `INSERT INTO driver_assignments(id,order_id,supplier_id,driver_id,status,scheduled_delivery_date)
    VALUES($1,$2,$3,$4,$5,'2099-02-03')`,
      [ids.assignment, ids.order, ids.supplier, ids.driver, assignmentStatus]
    )
  return ids
}

async function warehouseLeg(ids, { assignmentId = ids.assignment, driverId = ids.driver } = {}) {
  const warehouse = randomUUID(),
    leg = randomUUID()
  await pool.query(
    'INSERT INTO warehouse(id,supplier_id,tenant_id,name) VALUES($1::uuid,$2,$2,$1::text)',
    [warehouse, ids.supplier]
  )
  // These fixtures start after stock dispatch; stock transitions have separate integrity tests.
  await pool.query(
    `INSERT INTO order_warehouse_assignment(id,order_id,warehouse_id,status)
    VALUES($1,$2,$3,'dispatched')`,
    [leg, ids.order, warehouse]
  )
  if (assignmentId) {
    await pool.query('UPDATE driver_assignments SET warehouse_assignment_id=$2 WHERE id=$1', [
      assignmentId,
      leg,
    ])
    return { leg, assignment: assignmentId }
  }
  const {
    rows: [assignment],
  } = await pool.query(
    `INSERT INTO driver_assignments(order_id,supplier_id,driver_id,warehouse_assignment_id,status)
    VALUES($1,$2,$3,$4,'out_for_delivery') RETURNING id`,
    [ids.order, ids.supplier, driverId, leg]
  )
  return { leg, assignment: assignment.id }
}

describe('supplier driver fulfillment with real transactions', () => {
  it('serializes direct proof completion against route cancellation with order locks before the route', async () => {
    const ids = await fixture({
      status: 'SHIPPED',
      assignmentStatus: 'out_for_delivery',
      podRequired: true,
    })
    const routeId = randomUUID(),
      stopId = randomUUID()
    await pool.query(
      `INSERT INTO delivery_route(id,supplier_id,route_number,driver_id,scheduled_date,status)
      VALUES($1::uuid,$2,$1::text,$3,'2099-02-03','IN_PROGRESS')`,
      [routeId, ids.supplier, ids.driver]
    )
    await pool.query(
      `INSERT INTO route_stop(id,route_id,order_id,sequence_number,status) VALUES($1,$2,$3,1,'IN_TRANSIT')`,
      [stopId, routeId, ids.order]
    )
    const parentHeld = deferred(),
      releaseProof = deferred(),
      cancelFirstLock = deferred()
    hooks.after = async (label, sql) => {
      if (
        label === 'proof' &&
        /SELECT o\.id FROM customer_order o[\s\S]*FOR UPDATE OF o/.test(sql)
      ) {
        parentHeld.resolve()
        await releaseProof.promise
      }
    }
    hooks.before = (label, sql) => {
      if (label === 'cancel' && /FOR UPDATE/.test(sql)) {
        if (/FROM customer_order/.test(sql)) cancelFirstLock.resolve('order')
        else if (/FROM delivery_route/.test(sql)) cancelFirstLock.resolve('route')
      }
    }
    const settle = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error })
      )
    const proof = settle(
      auditContext.run('proof', () =>
        completeDeliveryWithProof({
          supplierId: ids.supplier,
          orderId: ids.order,
          driverAssignmentId: ids.assignment,
          recipientName: 'Receiver',
        })
      )
    )
    let cancel
    try {
      await within(parentHeld.promise, 'proof parent lock')
      cancel = settle(auditContext.run('cancel', () => cancelDeliveryRoute(ids.supplier, routeId)))
      const first = await within(cancelFirstLock.promise, 'cancellation first lock')
      expect(first).toBe('order')
      releaseProof.resolve()
      const results = await Promise.all([proof, cancel])
      expect(results.map((result) => result.error?.code)).not.toContain('40P01')
      expect(results[0].error).toBeUndefined()
      expect(results[1].error).toBeInstanceOf(ValidationError)
      expect(
        (await pool.query('SELECT status FROM delivery_route WHERE id=$1', [routeId])).rows[0]
          .status
      ).toBe('COMPLETED')
    } finally {
      releaseProof.resolve()
      await Promise.all([proof, ...(cancel ? [cancel] : [])])
      hooks.before = null
      hooks.after = null
    }
  })

  it('serializes route-stop dispatch against driver reassignment without reversing order/leg locks', async () => {
    const ids = await fixture()
    const routeId = randomUUID(),
      stopId = randomUUID()
    await pool.query(
      `INSERT INTO delivery_route(id,supplier_id,route_number,driver_id,scheduled_date,status)
      VALUES($1::uuid,$2,$1::text,$3,'2099-02-03','IN_PROGRESS')`,
      [routeId, ids.supplier, ids.driver]
    )
    await pool.query(
      `INSERT INTO route_stop(id,route_id,order_id,sequence_number,status) VALUES($1,$2,$3,1,'PLANNED')`,
      [stopId, routeId, ids.order]
    )
    const orderHeld = deferred(),
      releaseReassign = deferred(),
      firstDispatchLock = deferred(),
      assignmentHeld = deferred()
    hooks.before = (label, sql) => {
      if (label === 'route-dispatch' && /FOR UPDATE/i.test(sql)) {
        if (/FROM customer_order/i.test(sql)) firstDispatchLock.resolve('order')
        else if (/FROM driver_assignments/i.test(sql)) firstDispatchLock.resolve('assignment')
      }
    }
    hooks.after = async (label, sql) => {
      if (label === 'reassign' && /FROM customer_order[\s\S]*FOR UPDATE/i.test(sql)) {
        orderHeld.resolve()
        await releaseReassign.promise
      }
      if (label === 'route-dispatch' && /FROM driver_assignments[\s\S]*FOR UPDATE/i.test(sql))
        assignmentHeld.resolve()
    }
    const settle = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error })
      )
    const reassignment = settle(
      auditContext.run('reassign', () =>
        reassignDriver({
          supplierId: ids.supplier,
          orderId: ids.order,
          driverId: ids.newDriver,
          driverAssignmentId: ids.assignment,
        })
      )
    )
    let dispatch
    try {
      await within(orderHeld.promise, 'route reassignment parent lock')
      dispatch = settle(
        auditContext.run('route-dispatch', () =>
          updateRouteStop(ids.supplier, routeId, stopId, { status: 'OUT_FOR_DELIVERY' })
        )
      )
      const first = await within(firstDispatchLock.promise, 'route dispatch first delivery lock')
      if (first === 'assignment')
        await within(assignmentHeld.promise, 'route dispatch assignment lock')
      releaseReassign.resolve()
      const results = await Promise.all([reassignment, dispatch])
      expect(results.map((result) => result.error?.code)).not.toContain('40P01')
      expect(results[0].error).toBeUndefined()
      if (results[1].error)
        expect(['ValidationError', 'NotFoundError']).toContain(results[1].error.name)
    } finally {
      releaseReassign.resolve()
      await Promise.all([reassignment, ...(dispatch ? [dispatch] : [])])
      hooks.before = null
      hooks.after = null
    }
  })

  it('authorizes the actual linked driver leg and rejects a different driver leg on the same order', async () => {
    const ids = await fixture({ status: 'SHIPPED', assignmentStatus: 'out_for_delivery' })
    const userId = randomUUID()
    await pool.query(
      `INSERT INTO app_user(id,keycloak_sub,email,role) VALUES($1::uuid,$1::text,$2,'SUPPLIER')`,
      [userId, `${userId}@audit.invalid`]
    )
    await pool.query('UPDATE drivers SET user_id=$2 WHERE id=$1', [ids.driver, userId])
    await warehouseLeg(ids)
    const other = await warehouseLeg(ids, { assignmentId: null, driverId: ids.newDriver })
    const context = {
      userId,
      supplierId: ids.supplier,
      orderId: ids.order,
      permissions: [P.DRIVER_DELIVERIES_MANAGE, P.ORDERS_VIEW],
    }
    const access = await assertDriverAssignmentAccess(context)
    expect(access.assignment.id).toBe(ids.assignment)
    await expect(
      assertDriverAssignmentAccess({ ...context, assignmentId: other.assignment })
    ).rejects.toThrow('You can only access deliveries assigned to you')
  })

  it('returns the stored calendar day in driver detail without shifting it through UTC', async () => {
    const ids = await fixture()
    const detail = await getDriverDeliveryDetail(ids.order, ids.supplier, { driverId: ids.driver })
    expect(detail.scheduledDeliveryDate).toBe('2099-02-03')
  })

  it('refuses driver detail for a driver without a current leg on the order', async () => {
    const ids = await fixture()
    await expect(
      getDriverDeliveryDetail(ids.order, ids.supplier, { driverId: ids.newDriver })
    ).rejects.toThrow('Delivery not found')
  })

  it('does not count an unbound legacy proof as proof for every driver leg', async () => {
    const ids = await fixture()
    await pool.query(
      `INSERT INTO driver_assignments(order_id,supplier_id,driver_id,status)
      VALUES($1,$2,$3,'delivered')`,
      [ids.order, ids.supplier, ids.newDriver]
    )
    await pool.query(
      `INSERT INTO proof_of_delivery(order_id,recipient_name,delivery_date) VALUES($1,'Legacy receiver',CURRENT_DATE)`,
      [ids.order]
    )
    const detail = await getDriverDeliveryDetail(ids.order, ids.supplier, { driverId: ids.driver })
    expect(detail.podAvailable).toBe(false)
  })

  it('keeps a requested future delivery day when assigning a driver', async () => {
    const ids = await fixture({ assigned: false })
    const assignment = await assignDriverToOrder({
      supplierId: ids.supplier,
      orderId: ids.order,
      driverId: ids.driver,
    })
    const result = await pool.query(
      'SELECT scheduled_delivery_date::text AS day FROM driver_assignments WHERE id=$1',
      [assignment.id]
    )
    expect(result.rows[0].day).toBe('2099-02-03')
  })

  it.each([null, '2000-01-01'])(
    'uses the supplier local day for a missing or overdue requested date: %s',
    async (requestedDate) => {
      const ids = await fixture({ assigned: false, requestedDate })
      const {
        rows: [clock],
      } = await pool.query(
        `SELECT CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date <> CURRENT_DATE THEN 'Pacific/Kiritimati' ELSE 'Pacific/Pago_Pago' END AS zone`
      )
      await pool.query('UPDATE supplier SET last_order_timezone=$2 WHERE id=$1', [
        ids.supplier,
        clock.zone,
      ])
      const {
        rows: [day],
      } = await pool.query('SELECT (now() AT TIME ZONE $1)::date::text AS local_day', [clock.zone])
      const assignment = await assignDriverToOrder({
        supplierId: ids.supplier,
        orderId: ids.order,
        driverId: ids.driver,
      })
      expect(
        (
          await pool.query(
            'SELECT scheduled_delivery_date::text AS day FROM driver_assignments WHERE id=$1',
            [assignment.id]
          )
        ).rows[0].day
      ).toBe(day.local_day)
    }
  )

  it('completes required POD without an assignment selector, ties the proof to the exact leg and safely replays', async () => {
    const ids = await fixture({
      status: 'SHIPPED',
      assignmentStatus: 'out_for_delivery',
      podRequired: true,
    })
    const body = { supplierId: ids.supplier, orderId: ids.order, recipientName: 'Audit receiver' }
    const first = await completeDeliveryWithProof(body)
    const repeated = await completeDeliveryWithProof(body)
    expect(first.proof.driver_assignment_id).toBe(ids.assignment)
    expect(first.assignment.status).toBe('delivered')
    expect(repeated.proof.id).toBe(first.proof.id)
    const { rows: proofs } = await pool.query(
      'SELECT driver_assignment_id FROM proof_of_delivery WHERE order_id=$1',
      [ids.order]
    )
    expect(proofs).toEqual([{ driver_assignment_id: ids.assignment }])
    expect(
      (await pool.query('SELECT status FROM customer_order WHERE id=$1', [ids.order])).rows[0]
        .status
    ).toBe('DELIVERED')
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM invoice WHERE order_id=$1', [
          ids.order,
        ])
      ).rows[0].count
    ).toBe(0)
  })

  it('rejects an explicitly nonexistent POD assignment instead of storing an unbound proof', async () => {
    const ids = await fixture({ status: 'SHIPPED', assignmentStatus: 'out_for_delivery' })
    await expect(
      submitProofOfDelivery({
        supplierId: ids.supplier,
        orderId: ids.order,
        driverAssignmentId: randomUUID(),
        recipientName: 'Audit receiver',
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM proof_of_delivery WHERE order_id=$1', [
          ids.order,
        ])
      ).rows[0].count
    ).toBe(0)
  })

  it('resolves and replays a warehouse selector onto the same proof and driver assignment', async () => {
    const ids = await fixture({
      status: 'SHIPPED',
      assignmentStatus: 'out_for_delivery',
      podRequired: true,
    })
    const { leg } = await warehouseLeg(ids)
    const body = {
      supplierId: ids.supplier,
      orderId: ids.order,
      warehouseAssignmentId: leg,
      recipientName: 'Audit receiver',
    }
    const first = await completeDeliveryWithProof(body)
    const repeated = await completeDeliveryWithProof(body)
    expect(first.proof.driver_assignment_id).toBe(ids.assignment)
    expect(first.assignment.id).toBe(ids.assignment)
    expect(repeated.proof.id).toBe(first.proof.id)
    expect(
      (await pool.query('SELECT status FROM order_warehouse_assignment WHERE id=$1', [leg])).rows[0]
        .status
    ).toBe('delivered')
  })

  it('requires a selector for multiple active warehouse legs and keeps each proof isolated', async () => {
    const ids = await fixture({
      status: 'SHIPPED',
      assignmentStatus: 'out_for_delivery',
      podRequired: true,
    })
    const first = await warehouseLeg(ids)
    const second = await warehouseLeg(ids, { assignmentId: null, driverId: ids.newDriver })
    const body = { supplierId: ids.supplier, orderId: ids.order, recipientName: 'Audit receiver' }
    await expect(completeDeliveryWithProof(body)).rejects.toThrow(
      /Multiple active driver assignments/
    )
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM proof_of_delivery WHERE order_id=$1', [
          ids.order,
        ])
      ).rows[0].count
    ).toBe(0)
    const firstResult = await completeDeliveryWithProof({
      ...body,
      driverAssignmentId: first.assignment,
    })
    expect(firstResult.proof.driver_assignment_id).toBe(first.assignment)
    expect(
      (await pool.query('SELECT status FROM customer_order WHERE id=$1', [ids.order])).rows[0]
        .status
    ).toBe('SHIPPED')
    const secondResult = await completeDeliveryWithProof({
      ...body,
      warehouseAssignmentId: second.leg,
    })
    expect(secondResult.proof.driver_assignment_id).toBe(second.assignment)
    expect(secondResult.proof.id).not.toBe(firstResult.proof.id)
    expect(
      (await pool.query('SELECT status FROM customer_order WHERE id=$1', [ids.order])).rows[0]
        .status
    ).toBe('DELIVERED')
    await expect(completeDeliveryWithProof(body)).rejects.toThrow(
      /Multiple active driver assignments/
    )
  })

  it('rolls proof capture back when the delivery transition is invalid', async () => {
    const ids = await fixture()
    await expect(
      completeDeliveryWithProof({
        supplierId: ids.supplier,
        orderId: ids.order,
        driverAssignmentId: ids.assignment,
        recipientName: 'Audit receiver',
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM proof_of_delivery WHERE order_id=$1', [
          ids.order,
        ])
      ).rows[0].count
    ).toBe(0)
    expect(
      (await pool.query('SELECT status FROM driver_assignments WHERE id=$1', [ids.assignment]))
        .rows[0].status
    ).toBe('assigned')
  })

  it('rejects a real assignment belonging to another supplier order without writing proof', async () => {
    const ids = await fixture({ status: 'SHIPPED', assignmentStatus: 'out_for_delivery' })
    const foreign = await fixture({ status: 'SHIPPED', assignmentStatus: 'out_for_delivery' })
    await expect(
      completeDeliveryWithProof({
        supplierId: ids.supplier,
        orderId: ids.order,
        driverAssignmentId: foreign.assignment,
        recipientName: 'Audit receiver',
      })
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      submitProofOfDelivery({
        supplierId: ids.supplier,
        orderId: ids.order,
        driverAssignmentId: foreign.assignment,
        recipientName: 'Audit receiver',
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM proof_of_delivery WHERE order_id=ANY($1::uuid[])',
          [[ids.order, foreign.order]]
        )
      ).rows[0].count
    ).toBe(0)
  })

  it('completes proof capture with a single-connection pool without acquiring a second connection inside the transaction', async () => {
    const ids = await fixture({
      status: 'SHIPPED',
      assignmentStatus: 'out_for_delivery',
      podRequired: true,
    })
    const result = await auditContext.run('single-connection', () =>
      completeDeliveryWithProof({
        supplierId: ids.supplier,
        orderId: ids.order,
        driverAssignmentId: ids.assignment,
        recipientName: 'Audit receiver',
      })
    )
    expect(result.assignment.status).toBe('delivered')
    expect(result.proof.driver_assignment_id).toBe(ids.assignment)
  })

  it('serializes reassignment against dispatch instead of deadlocking on order/assignment lock inversion', async () => {
    const ids = await fixture()
    const orderHeld = deferred(),
      releaseReassign = deferred(),
      firstStatusLock = deferred(),
      assignmentHeld = deferred()
    hooks.before = (label, sql) => {
      if (label === 'status' && /FOR UPDATE/i.test(sql)) {
        if (/FROM customer_order/i.test(sql)) firstStatusLock.resolve('order')
        else if (/FROM driver_assignments/i.test(sql)) firstStatusLock.resolve('assignment')
      }
    }
    hooks.after = async (label, sql) => {
      if (label === 'reassign' && /FROM customer_order[\s\S]*FOR UPDATE/i.test(sql)) {
        orderHeld.resolve()
        await releaseReassign.promise
      }
      if (label === 'status' && /FROM driver_assignments[\s\S]*FOR UPDATE/i.test(sql))
        assignmentHeld.resolve()
    }
    const settle = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error })
      )
    const reassignment = settle(
      auditContext.run('reassign', () =>
        reassignDriver({
          supplierId: ids.supplier,
          orderId: ids.order,
          driverId: ids.newDriver,
          driverAssignmentId: ids.assignment,
          reason: 'Audit dispatch race',
        })
      )
    )
    let dispatch
    try {
      await within(orderHeld.promise, 'reassignment parent lock')
      dispatch = settle(
        auditContext.run('status', () =>
          updateDeliveryStatus({
            supplierId: ids.supplier,
            orderId: ids.order,
            driverAssignmentId: ids.assignment,
            status: 'out_for_delivery',
          })
        )
      )
      const first = await within(firstStatusLock.promise, 'dispatch first lock')
      if (first === 'assignment') await within(assignmentHeld.promise, 'dispatch assignment lock')
      releaseReassign.resolve()
      const results = await Promise.all([reassignment, dispatch])
      expect(results.map((result) => result.error?.code)).not.toContain('40P01')
      for (const result of results)
        if (result.error) expect(result.error).toBeInstanceOf(ValidationError)
      const { rows } = await pool.query(
        "SELECT id FROM driver_assignments WHERE order_id=$1 AND status IN ('assigned','picked_up','out_for_delivery','rescheduled')",
        [ids.order]
      )
      expect(rows).toHaveLength(1)
    } finally {
      releaseReassign.resolve()
      await Promise.all([reassignment, ...(dispatch ? [dispatch] : [])])
      hooks.before = null
      hooks.after = null
    }
  })
})
