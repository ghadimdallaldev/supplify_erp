#!/usr/bin/env node
/**
 * Verify migration 0188 indexes exist and invoice list can use issue_date index.
 * Usage: DATABASE_URL=... node scripts/verify-migration-0188.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pgPath = path.join(__dirname, '../apps/api/node_modules/pg/lib/index.js')
const { default: pg } = await import(pathToFileURL(pgPath).href)

const databaseUrl =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPPLIFY_DATABASE_URL ||
  process.env.DATABASE_PRIVATE_URL

if (!databaseUrl) {
  console.error('Set DATABASE_URL')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})
await client.connect()

const migrations = await client.query(
  `SELECT version FROM schema_migrations WHERE version LIKE '%0188%' OR version LIKE '%perf_audit%'`
)
const indexes = await client.query(
  `SELECT indexname, indexdef FROM pg_indexes
   WHERE indexname IN (
     'idx_invoice_supplier_issue_date',
     'idx_invoice_restaurant_issue_date',
     'idx_invoice_supplier_date',
     'idx_invoice_restaurant_date'
   )
   ORDER BY indexname`
)
const explain = await client.query(
  `EXPLAIN (FORMAT TEXT)
   SELECT i.id FROM invoice i
   WHERE i.supplier_id = (SELECT id FROM supplier LIMIT 1)
   ORDER BY i.issue_date DESC, i.invoice_number DESC
   LIMIT 50`
)

const out = {
  generatedAt: new Date().toISOString(),
  migrations: migrations.rows,
  indexes: indexes.rows.map((r) => ({ name: r.indexname, def: r.indexdef })),
  explainPlan: explain.rows.map((r) => r['QUERY PLAN']),
}

console.log(JSON.stringify(out, null, 2))
const outPath = path.join(__dirname, '../docs/audits/performance/migration-0188-verification.json')
fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
console.error(`Wrote ${outPath}`)
await client.end()
