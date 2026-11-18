import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ beforeTransaction: null, before: null, after: null }))
vi.mock('../../apps/api/src/config/env.js', () => ({
  config: {
    NODE_ENV: 'test',
    APP_ENV: 'dev',
    DELIVERY_ROLLOVER_ENABLED: true,
    DELIVERY_ROLLOVER_CUTOFF_HOUR: 3,
    DELIVERY_ROLLOVER_TIMEZONE: 'Asia/Beirut',
    DELIVERY_ROLLOVER_KEEP_DRIVER: true,
  },
}))
vi.mock('../../apps/api/src/lib/audit.js', () => ({ writeSystemAuditLog: vi.fn() }))
vi.mock('../../apps/api/src/services/notification.service.js', () => ({
  notifyDeliveryRolloverBatch: vi.fn(),
  notifyOrderStatusChange: vi.fn(),
  notifyDriverDeliveryMilestone: vi.fn(),
}))
vi.mock('../../apps/api/src/services/storage/storage.service.js', () => ({
  buildObjectPublicUrl: (key) => `https://audit.invalid/${key}`,
}))
vi.mock('../../apps/api/src/lib/dispatch-cache.js', () => ({
  invalidateDispatchCacheForSupplier: vi.fn(),
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const url = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/rbac_audit')
    throw new Error('Refusing non-isolated supplier rollover target')
  const pool = new Pool({ connectionString: url.href, max: 6 })
  const auditContext = new AsyncLocalStorage()
  const query = (sql, params) => pool.query(sql, params)
  const withTransaction = async (callback) => {
    const hook = hooks.beforeTransaction
    hooks.beforeTransaction = null
    if (hook) await hook()
    const raw = await pool.connect(),
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
  return { pool, auditContext, query, withTransaction, migrationQuery: query }
})

import { pool, auditContext } from '../../apps/api/src/lib/db.js'
import {
  findUndeliveredAssignmentsForRollover,
  rolloverAssignmentToNextDay,
  runDeliveryRolloverJob,
} from '../../apps/api/src/services/delivery-rollover.service.js'
import { updateDeliveryStatus } from '../../apps/api/src/services/driver-fulfillment.service.js'

afterAll(() => pool.end())
beforeEach(() => {
  hooks.beforeTransaction = null
  hooks.before = null
  hooks.after = null
})

async function fixture() {
  const ids = Object.fromEntries(
    ['supplier', 'restaurant', 'driver', 'order', 'assignment', 'product'].map((key) => [
      key,
      randomUUID(),
    ])
  )
  await pool.query('INSERT INTO supplier(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
    ids.supplier,
  ])
  await pool.query('INSERT INTO restaurant(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
    ids.restaurant,
  ])
  await pool.query('INSERT INTO drivers(id,supplier_id,full_name) VALUES($1::uuid,$2,$1::text)', [
    ids.driver,
    ids.supplier,
  ])
  await pool.query(
    'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
    [ids.product, ids.supplier]
  )
  await pool.query(
    `INSERT INTO customer_order(id,restaurant_id,status,requested_delivery_date)
     VALUES($1,$2,'PROCESSING','2000-01-01')`,
    [ids.order, ids.restaurant]
  )
  await pool.query(
    'INSERT INTO order_item(order_id,product_id,supplier_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,5,5)',
    [ids.order, ids.product, ids.supplier]
  )
  await pool.query(
    `INSERT INTO driver_assignments(id,order_id,supplier_id,driver_id,status,scheduled_delivery_date)
     VALUES($1,$2,$3,$4,'assigned','2000-01-01')`,
    [ids.assignment, ids.order, ids.supplier, ids.driver]
  )
  await pool.query(
    "INSERT INTO subscription(tenant_id,tenant_type,plan_name,status) VALUES($1,'SUPPLIER','Audit fixture','ACTIVE')",
    [ids.supplier]
  )
  return ids
}

async function assignmentState(id) {
  return (
    await pool.query(
      'SELECT status,scheduled_delivery_date::text AS day,rollover_count FROM driver_assignments WHERE id=$1',
      [id]
    )
  ).rows[0]
}

describe('supplier rollover with real SQL', () => {
  it('executes the actual job selection and roll once per supplier day', async () => {
    const ids = await fixture()
    expect(await runDeliveryRolloverJob({ tenantId: ids.supplier })).toMatchObject({
      enabled: true,
      candidates: 1,
      rolled: 1,
      errors: 0,
    })
    expect(await runDeliveryRolloverJob({ tenantId: ids.supplier })).toMatchObject({
      enabled: true,
      candidates: 0,
      rolled: 0,
      errors: 0,
    })
  })

  it('serializes pickup against rollover using the parent order before the leg', async () => {
    const ids = await fixture()
    const deferred = () => {
      let resolve
      const promise = new Promise((done) => {
        resolve = done
      })
      return { promise, resolve }
    }
    const parentHeld = deferred(),
      releasePickup = deferred(),
      firstLock = deferred()
    const within = async (promise) => {
      let timer
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Rollover race barrier timed out')), 3000)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    }
    hooks.after = async (label, sql) => {
      if (
        label === 'pickup' &&
        /SELECT o\.id FROM customer_order o[\s\S]*FOR UPDATE OF o/.test(sql)
      ) {
        parentHeld.resolve()
        await releasePickup.promise
      }
    }
    hooks.before = (label, sql) => {
      if (label === 'rollover' && /FOR UPDATE/.test(sql))
        firstLock.resolve(/FROM customer_order/.test(sql) ? 'order' : 'other')
    }
    const settle = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error })
      )
    const pickup = settle(
      auditContext.run('pickup', () =>
        updateDeliveryStatus({
          supplierId: ids.supplier,
          orderId: ids.order,
          driverAssignmentId: ids.assignment,
          status: 'picked_up',
        })
      )
    )
    let rollover
    try {
      await within(parentHeld.promise)
      rollover = settle(
        auditContext.run('rollover', () =>
          rolloverAssignmentToNextDay({ assignmentId: ids.assignment, force: true })
        )
      )
      expect(await within(firstLock.promise)).toBe('order')
      releasePickup.resolve()
      const results = await Promise.all([pickup, rollover])
      expect(results.map((result) => result.error?.code)).not.toContain('40P01')
      expect(results[0].error).toBeUndefined()
      expect(results[1].value).toMatchObject({
        ok: false,
        reason: 'ineligible_status',
        status: 'picked_up',
      })
      expect((await assignmentState(ids.assignment)).status).toBe('picked_up')
    } finally {
      releasePickup.resolve()
      await Promise.all([pickup, ...(rollover ? [rollover] : [])])
      hooks.before = null
      hooks.after = null
    }
  })

  it('allocates a route number beyond a gap left by removed routes', async () => {
    const ids = await fixture()
    const {
      rows: [day],
    } = await pool.query("SELECT to_char(now() AT TIME ZONE 'UTC','YYYYMMDD') AS value")
    await pool.query(
      `INSERT INTO delivery_route(supplier_id,route_number,scheduled_date,status)
       VALUES($1,$2,'2000-01-01','CANCELLED')`,
      [ids.supplier, `R-${day.value}-002`]
    )
    const outcome = await rolloverAssignmentToNextDay({ assignmentId: ids.assignment, force: true })
    expect(outcome.ok).toBe(true)
    expect(
      (await pool.query('SELECT route_number FROM delivery_route WHERE id=$1', [outcome.routeId]))
        .rows[0].route_number
    ).toBe(`R-${day.value}-003`)
  })

  it('selects overdue PostgreSQL calendar dates without treating them as timestamps', async () => {
    const ids = await fixture()
    const rows = await findUndeliveredAssignmentsForRollover({ tenantId: ids.supplier })
    expect(rows.map((row) => row.id)).toContain(ids.assignment)
    expect(rows[0].effective_delivery_date).toBe('2000-01-01')
  })

  it('moves a real DATE assignment and adds its next-day route exactly once', async () => {
    const ids = await fixture()
    const outcome = await rolloverAssignmentToNextDay({ assignmentId: ids.assignment, force: true })
    expect(outcome).toMatchObject({
      ok: true,
      previousDate: '2000-01-01',
      scheduledDeliveryDate: '2000-01-02',
    })
    expect(await assignmentState(ids.assignment)).toEqual({
      status: 'rescheduled',
      day: '2000-01-02',
      rollover_count: 1,
    })
    expect(
      (
        await pool.query('SELECT order_id,status FROM route_stop WHERE route_id=$1', [
          outcome.routeId,
        ])
      ).rows
    ).toEqual([{ order_id: ids.order, status: 'PLANNED' }])
    expect(await rolloverAssignmentToNextDay({ assignmentId: ids.assignment })).toMatchObject({
      ok: false,
      reason: 'already_rolled_today',
    })
  })

  it('rechecks terminal order status after the preflight read', async () => {
    const ids = await fixture()
    hooks.beforeTransaction = () =>
      pool.query("UPDATE customer_order SET status='CANCELLED' WHERE id=$1", [ids.order])
    expect(
      await rolloverAssignmentToNextDay({ assignmentId: ids.assignment, force: true })
    ).toMatchObject({ ok: false, reason: 'terminal_order', orderStatus: 'CANCELLED' })
    expect(await assignmentState(ids.assignment)).toEqual({
      status: 'assigned',
      day: '2000-01-01',
      rollover_count: 0,
    })
  })

  it('does not overwrite a future reschedule committed after the preflight read', async () => {
    const ids = await fixture()
    hooks.beforeTransaction = () =>
      pool.query("UPDATE driver_assignments SET scheduled_delivery_date='2099-02-03' WHERE id=$1", [
        ids.assignment,
      ])
    expect(await rolloverAssignmentToNextDay({ assignmentId: ids.assignment })).toMatchObject({
      ok: false,
      reason: 'before_cutoff',
    })
    expect(await assignmentState(ids.assignment)).toEqual({
      status: 'assigned',
      day: '2099-02-03',
      rollover_count: 0,
    })
  })

  it('rechecks the same-day rollover marker under the write lock', async () => {
    const ids = await fixture()
    hooks.beforeTransaction = () =>
      pool.query(
        "UPDATE driver_assignments SET status='rescheduled',rolled_over_at=now(),rollover_count=1 WHERE id=$1",
        [ids.assignment]
      )
    expect(await rolloverAssignmentToNextDay({ assignmentId: ids.assignment })).toMatchObject({
      ok: false,
      reason: 'already_rolled_today',
    })
    expect((await assignmentState(ids.assignment)).rollover_count).toBe(1)
  })
})
