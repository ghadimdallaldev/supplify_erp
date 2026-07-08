#!/usr/bin/env node
/**
 * Run EXPLAIN (ANALYZE, BUFFERS) for hot-path queries against a Postgres DATABASE_URL.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/perf-explain-queries.mjs
 *
 * Output: docs/audits/performance/perf-explain-results.txt
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../docs/audits/performance/perf-explain-results.txt')

const pgPath = path.join(__dirname, '../apps/api/node_modules/pg/lib/index.js')
const { default: pg } = await import(pathToFileURL(pgPath).href)

const databaseUrl =
  process.env.DATABASE_URL || process.env.SUPPLIFY_DATABASE_URL || process.env.DATABASE_PRIVATE_URL

if (!databaseUrl) {
  console.error('Set DATABASE_URL to run EXPLAIN analysis')
  process.exit(1)
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined })

const QUERIES = [
  {
    name: 'restaurant_inventory_list',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      WITH usage AS (
        SELECT restaurant_id, product_id,
          COALESCE(SUM(ABS(quantity)) FILTER (WHERE type = 'SUBTRACT'), 0) / 30.0 AS avg_daily_usage
        FROM inventory_movement_log
        WHERE restaurant_id = (SELECT id FROM restaurant LIMIT 1)
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY restaurant_id, product_id
      )
      SELECT ri.*, p.name AS product_name
      FROM restaurant_inventory ri
      JOIN product p ON p.id = ri.product_id
      LEFT JOIN usage u ON u.restaurant_id = ri.restaurant_id AND u.product_id = ri.product_id
      WHERE ri.restaurant_id = (SELECT id FROM restaurant LIMIT 1)
      ORDER BY ri.updated_at DESC, ri.created_at DESC
      LIMIT 100
    `,
  },
  {
    name: 'supplier_orders_list',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT DISTINCT o.id, o.created_at
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id
      JOIN product p ON p.id = oi.product_id
      WHERE p.supplier_id = (SELECT id FROM supplier LIMIT 1)
      ORDER BY o.created_at DESC
      LIMIT 20
    `,
  },
  {
    name: 'invoice_list_supplier',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT i.id, i.issue_date, i.invoice_number,
        COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'COMPLETED'), 0) AS total_paid
      FROM invoice i
      LEFT JOIN payment pay ON pay.invoice_id = i.id
      WHERE i.supplier_id = (SELECT id FROM supplier LIMIT 1)
      GROUP BY i.id
      ORDER BY i.issue_date DESC, i.invoice_number DESC
      LIMIT 50
    `,
  },
]

async function main() {
  await client.connect()
  const lines = [`EXPLAIN results — ${new Date().toISOString()}`, `Database: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`, '']

  for (const q of QUERIES) {
    lines.push(`\n=== ${q.name} ===\n`)
    try {
      const { rows } = await client.query(q.sql)
      lines.push(rows.map((r) => r['QUERY PLAN']).join('\n'))
    } catch (err) {
      lines.push(`ERROR: ${err.message}`)
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, lines.join('\n'))
  console.log(`Wrote ${OUT}`)
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
