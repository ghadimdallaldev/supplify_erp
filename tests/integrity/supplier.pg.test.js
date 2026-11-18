import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import express from '../../apps/api/node_modules/express/index.js'
import request from '../../apps/api/node_modules/supertest/index.js'

vi.mock('../../apps/api/src/config/env.js', () => ({
  config: { NODE_ENV: 'test', APP_ENV: 'dev', CRONS_ENABLED: false, EMAIL_ENABLED: false },
}))
vi.mock('../../apps/api/src/lib/cache.js', () => ({
  getCache: async () => null,
  setCache: async () => {},
  deleteCache: async () => {},
}))
vi.mock('../../apps/api/src/services/notification.service.js', async (original) => ({
  ...(await original()),
  notifyQuoteRequestReceived: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const url = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/rbac_audit')
    throw new Error('Refusing a non-isolated audit database')
  const pool = new Pool({ connectionString: url.href, max: 8 })
  const withTransaction = async (fn) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return { pool, query: (sql, params) => pool.query(sql, params), withTransaction }
})

import { pool } from '../../apps/api/src/lib/db.js'
import { getSupplierCommandCenter } from '../../apps/api/src/services/supplier-command-center.service.js'
import { getSupplierRunSheet } from '../../apps/api/src/services/supplier-run-sheet.service.js'
import {
  getSupplierReceivables,
  exportSupplierStatementCsv,
} from '../../apps/api/src/services/supplier-receivables.service.js'
import { getSupplierWeeklyIntelligenceSummary } from '../../apps/api/src/services/supplier-weekly-intelligence-summary.service.js'
import { getReorderIntelligence } from '../../apps/api/src/services/supplier-reorder-intelligence.service.js'
import { getSupplierReorderAssistance } from '../../apps/api/src/services/supplier-reorder-assistance.service.js'
import { getSupplierDeliveryBoard } from '../../apps/api/src/services/supplier-deliveries.service.js'
import { getSupplierGrowthMetrics } from '../../apps/api/src/services/supplier-growth-metrics.service.js'
import {
  exportInvoicesCsv,
  exportInvoicesQuickBooksCsv,
  exportPaymentsCsv,
  exportArSummaryCsv,
} from '../../apps/api/src/services/supplier-accounting-export.service.js'
import { executeCustomerImport } from '../../apps/api/src/services/supplier-customer-import.service.js'
import {
  getSupplierLoyaltyProgram,
  upsertSupplierLoyaltyProgram,
  listSupplierLoyaltyBalances,
} from '../../apps/api/src/services/loyalty.service.js'
import orderListRouter from '../../apps/api/src/routes/orders/list.js'

afterAll(() => pool.end())

async function fixture() {
  const ids = Object.fromEntries(
    ['supplier', 'otherSupplier', 'restaurant', 'otherRestaurant', 'product'].map((key) => [
      key,
      randomUUID(),
    ])
  )
  for (const id of [ids.supplier, ids.otherSupplier]) {
    await pool.query('INSERT INTO supplier(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [id])
  }
  for (const id of [ids.restaurant, ids.otherRestaurant]) {
    await pool.query('INSERT INTO restaurant(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
      id,
    ])
  }
  await pool.query(
    'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
    [ids.product, ids.supplier]
  )
  return ids
}

async function invoice(
  ids,
  { supplierId = ids.supplier, currency = 'USD', amount = 20, status = 'ISSUED' } = {}
) {
  const id = randomUUID()
  await pool.query(
    `INSERT INTO invoice(id, invoice_number, supplier_id, restaurant_id, total_amount, subtotal, balance_due, currency, status, invoice_date, due_date)
    VALUES($1::uuid,$1::text,$2,$3,$4,$4,$4,$5,$6,CURRENT_DATE,CURRENT_DATE-1)`,
    [id, supplierId, ids.restaurant, amount, currency, status]
  )
  return id
}

describe('supplier services against current PostgreSQL schema', () => {
  it('targets the oldest invoice in each debtor currency, including beyond the invoice preview', async () => {
    const ids = await fixture()
    const usd = await invoice(ids, { currency: 'USD' })
    const eur = await invoice(ids, { currency: 'EUR' })
    await pool.query("UPDATE invoice SET due_date='2026-01-01' WHERE id=$1", [usd])
    await pool.query("UPDATE invoice SET due_date='2026-03-01' WHERE id=$1", [eur])
    // Push the EUR invoice outside the 100-row preview. Top-debtor actions must
    // still refer to the EUR invoice rather than a USD invoice or no invoice.
    await pool.query(
      `INSERT INTO invoice (
      invoice_number, supplier_id, restaurant_id, total_amount, subtotal,
      balance_due, currency, status, invoice_date, due_date
    ) SELECT 'AUDIT-' || gen_random_uuid()::text, $1, $2, 1, 1, 1,
      'USD', 'ISSUED', '2026-01-01', '2026-02-01'
      FROM generate_series(1, 100)`,
      [ids.supplier, ids.restaurant]
    )
    const result = await getSupplierReceivables(ids.supplier)
    expect(result.invoices).toHaveLength(100)
    expect(result.topDebtors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'USD', oldestInvoiceId: usd }),
        expect.objectContaining({ currency: 'EUR', oldestInvoiceId: eur }),
      ])
    )
  })

  it('ages accounting exports on the supplier calendar day', async () => {
    const ids = await fixture(),
      id = await invoice(ids)
    const {
      rows: [clock],
    } = await pool.query(`SELECT
      CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date <> CURRENT_DATE
        THEN 'Pacific/Kiritimati' ELSE 'Pacific/Pago_Pago' END AS zone`)
    await pool.query('UPDATE supplier SET last_order_timezone=$2 WHERE id=$1', [
      ids.supplier,
      clock.zone,
    ])
    const {
      rows: [dates],
    } = await pool.query(
      `SELECT CURRENT_DATE::text AS server_day,
      (now() AT TIME ZONE $1)::date::text AS supplier_day`,
      [clock.zone]
    )
    const due = dates.server_day < dates.supplier_day ? dates.server_day : dates.supplier_day
    await pool.query('UPDATE invoice SET due_date=$2 WHERE id=$1', [id, due])
    const csv = await exportArSummaryCsv(ids.supplier)
    const fields = csv.trim().split('\n')[1].split(',')
    expect(Number(fields[dates.supplier_day > due ? 4 : 3])).toBe(20)
  })
  it.each([
    ['command center', getSupplierCommandCenter],
    ['daily run sheet', getSupplierRunSheet],
    ['receivables', getSupplierReceivables],
    ['weekly intelligence and all five underlying sources', getSupplierWeeklyIntelligenceSummary],
    ['reorder intelligence', getReorderIntelligence],
    ['reorder assistance', getSupplierReorderAssistance],
    ['delivery board', getSupplierDeliveryBoard],
    ['customer growth metrics', getSupplierGrowthMetrics],
    ['loyalty balances', listSupplierLoyaltyBalances],
    ['invoice CSV', (id) => exportInvoicesCsv(id, { from: '2000-01-01', to: '2100-01-01' })],
    [
      'QuickBooks CSV',
      (id) => exportInvoicesQuickBooksCsv(id, { from: '2000-01-01', to: '2100-01-01' }),
    ],
    ['payment CSV', (id) => exportPaymentsCsv(id, { from: '2000-01-01', to: '2100-01-01' })],
    ['AR CSV', exportArSummaryCsv],
  ])('executes %s with real SQL and an empty tenant', async (_, fn) => {
    const ids = await fixture()
    const result = await fn(ids.supplier)
    expect(result).toBeDefined()
    expect(JSON.stringify(result)).not.toContain(ids.otherSupplier)
  })

  it('keeps supplier receivables currencies separate and excludes another supplier and void invoices', async () => {
    const ids = await fixture()
    const usd = await invoice(ids, { amount: 20 })
    const eur = await invoice(ids, { amount: 30, currency: 'EUR' })
    await invoice(ids, { supplierId: ids.otherSupplier, amount: 900 })
    await invoice(ids, { amount: 400, status: 'VOID' })
    const result = await getSupplierReceivables(ids.supplier)
    expect(result.summary.unpaidCount).toBe(2)
    expect(result.summary.unpaidTotal).toBeNull()
    expect(result.summary.byCurrency).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'USD', unpaidTotal: 20 }),
        expect.objectContaining({ currency: 'EUR', unpaidTotal: 30 }),
      ])
    )
    expect(result.invoices.map((row) => row.id).sort()).toEqual([usd, eur].sort())
    expect(result.invoices.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate))).toBe(true)
  })

  it('returns the real pick queue instead of silently hiding a SQL failure', async () => {
    const ids = await fixture(),
      order = randomUUID()
    await pool.query(
      `INSERT INTO customer_order(id,restaurant_id,status,total_amount,currency,requested_delivery_date)
      VALUES($1,$2,'ACKNOWLEDGED',5,'USD','2026-06-17')`,
      [order, ids.restaurant]
    )
    await pool.query(
      'INSERT INTO order_item(order_id,product_id,supplier_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,5,5)',
      [order, ids.product, ids.supplier]
    )
    const result = await getSupplierRunSheet(ids.supplier, { date: '2026-06-17' })
    expect(result.ordersToPick.orders.map((row) => row.orderId)).toEqual([order])
    expect(result.ordersToPick.count).toBe(1)
  })

  it('does not label mixed-currency run-sheet collections as one total', async () => {
    const ids = await fixture()
    await invoice(ids, { amount: 20 })
    await invoice(ids, { amount: 30, currency: 'EUR' })
    const result = await getSupplierRunSheet(ids.supplier)
    expect(result.receivablesDueToday.summary.totalBalanceDue).toBeNull()
    expect(result.receivablesDueToday.summary.byCurrency).toEqual(
      expect.arrayContaining([
        { currency: 'USD', totalBalanceDue: 20 },
        { currency: 'EUR', totalBalanceDue: 30 },
      ])
    )
    const ar = await exportArSummaryCsv(ids.supplier)
    expect(ar.split('\n')[0]).toContain('Currency')
    expect(ar).toContain('USD')
    expect(ar).toContain('EUR')
    expect(ar.trim().split('\n')).toHaveLength(3)
  })

  it('exports only the selected supplier invoices and valid CSV column headers', async () => {
    const ids = await fixture()
    const mine = await invoice(ids)
    const other = await invoice(ids, { supplierId: ids.otherSupplier })
    const csv = await exportInvoicesCsv(ids.supplier, { from: '2000-01-01', to: '2100-01-01' })
    expect(csv).toContain(mine)
    expect(csv).not.toContain(other)
    expect(csv.split('\n')[0]).toMatch(/invoice/i)
    const {
      rows: [{ date }],
    } = await pool.query('SELECT CURRENT_DATE::text AS date')
    expect(csv.trim().split('\n')[1].split(',')[1]).toBe(date)
    const statement = await exportSupplierStatementCsv(ids.supplier, ids.restaurant)
    expect(statement).toContain(mine)
    expect(statement).not.toContain(other)
  })

  it('exports DATE values and a legacy header-only invoice amount correctly', async () => {
    const ids = await fixture(),
      id = await invoice(ids, { amount: 27.5, currency: 'EUR' })
    await pool.query(
      `INSERT INTO payment(invoice_id,payment_number,payment_date,payment_amount,payment_method,status)
      VALUES($1,$2,CURRENT_DATE,5,'CASH','COMPLETED')`,
      [id, randomUUID()]
    )
    const range = { from: '2000-01-01', to: '2100-01-01' }
    const {
      rows: [{ date }],
    } = await pool.query('SELECT CURRENT_DATE::text AS date')
    const qb = await exportInvoicesQuickBooksCsv(ids.supplier, range)
    const values = qb.trim().split('\n')[1].split(',')
    expect(values[2]).toBe(date)
    expect(Number(values.at(-1))).toBe(27.5)
    const payments = await exportPaymentsCsv(ids.supplier, range)
    expect(payments.trim().split('\n')[1].split(',')[1]).toBe(date)
    expect(payments.trim().split('\n')[1].split(',').at(-1)).toBe('EUR')
  })

  it('calculates overdue days on the selected run-sheet date rather than today', async () => {
    const ids = await fixture(),
      id = await invoice(ids)
    await pool.query("UPDATE invoice SET due_date='2026-06-16' WHERE id=$1", [id])
    const result = await getSupplierRunSheet(ids.supplier, { date: '2026-06-17' })
    expect(result.receivablesDueToday.invoices[0]).toMatchObject({
      id,
      isOverdue: true,
      daysOverdue: 1,
    })
  })

  it('imports customer prospects idempotently per supplier without issuing invitations', async () => {
    const ids = await fixture()
    const email = `${randomUUID()}@example.test`
    const csv = `restaurant_name,email\nAudit restaurant,${email}\n`
    const first = await executeCustomerImport(ids.supplier, csv)
    const repeated = await executeCustomerImport(ids.supplier, csv)
    const other = await executeCustomerImport(ids.otherSupplier, csv)
    expect(first).toMatchObject({ created: 1, failed: 0 })
    expect(repeated).toMatchObject({ created: 0, skipped: 1, failed: 0 })
    expect(other).toMatchObject({ created: 1, failed: 0 })
    const invitations = await pool.query(
      'SELECT count(*)::int AS count FROM supplier_growth_invitation WHERE supplier_id=$1',
      [ids.supplier]
    )
    expect(invitations.rows[0].count).toBe(0)
  })

  it('stores supplier loyalty settings without leaking them across tenants', async () => {
    const ids = await fixture()
    await upsertSupplierLoyaltyProgram(ids.supplier, { enabled: true, earnPointsPerCurrency: 2 })
    expect(await getSupplierLoyaltyProgram(ids.supplier)).toMatchObject({
      supplier_id: ids.supplier,
      enabled: true,
    })
    expect(await getSupplierLoyaltyProgram(ids.otherSupplier)).toBeNull()
  })

  it('limits supplier order-list rows and included lines to their supplier', async () => {
    const ids = await fixture()
    const order = randomUUID(),
      otherOrder = randomUUID(),
      otherProduct = randomUUID()
    await pool.query(
      'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
      [otherProduct, ids.otherSupplier]
    )
    for (const id of [order, otherOrder])
      await pool.query(
        'INSERT INTO customer_order(id,restaurant_id,status,total_amount,currency) VALUES($1,$2,$3,5,$4)',
        [id, ids.restaurant, 'PLACED', 'USD']
      )
    for (const [orderId, productId, supplierId] of [
      [order, ids.product, ids.supplier],
      [otherOrder, otherProduct, ids.otherSupplier],
    ]) {
      await pool.query(
        'INSERT INTO order_item(order_id,product_id,supplier_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,5,5)',
        [orderId, productId, supplierId]
      )
    }
    await expect(
      pool.query(
        'INSERT INTO order_item(order_id,product_id,supplier_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,5,5)',
        [order, otherProduct, ids.otherSupplier]
      )
    ).rejects.toMatchObject({ code: '23514' })
    const app = express()
    app.use((req, _res, next) => {
      req.userData = { id: randomUUID(), role: 'SUPPLIER' }
      req.tenantContext = { tenantType: 'SUPPLIER', tenantId: ids.supplier }
      req._requestTenantResolved = true
      req._requestTenantCache = req.tenantContext
      next()
    })
    app.use('/api/orders', orderListRouter)
    const response = await request(app).get('/api/orders?includeItems=true').expect(200)
    expect(response.body.data.orders.map((row) => row.id)).toEqual([order])
    expect(response.body.data.orders[0].items.map((row) => row.supplier_id)).toEqual([ids.supplier])
  })
})
