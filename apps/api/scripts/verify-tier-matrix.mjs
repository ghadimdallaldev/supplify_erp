#!/usr/bin/env node
/**
 * CI / local guard: every canonical feature/limit key must be present on each
 * active tier (free/silver/gold/platinum) per tenant type; limits and features
 * must be monotonic up the ladder. Extra DB keys are warnings only.
 */
import 'dotenv/config'
import { pool } from '../src/lib/db.js'
import {
  verifyTierMatrix,
  formatTierMatrixReport,
} from '../src/lib/tier-matrix-verify.js'

let rows
try {
  ;({ rows } = await pool.query(
    `SELECT code, tenant_type, limits, features
     FROM subscription_plan
     WHERE is_active = true
       AND lower(code) IN ('free', 'silver', 'gold', 'platinum')
     ORDER BY tenant_type, code`
  ))
} catch (err) {
  const code = err?.code || err?.errors?.[0]?.code
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    console.log(
      'SKIP: PostgreSQL unavailable — run `pnpm db:migrate` then `pnpm verify:tier-matrix` in CI.'
    )
    await pool.end().catch(() => {})
    process.exit(0)
  }
  throw err
}

const result = verifyTierMatrix(rows)
const report = formatTierMatrixReport(result)
console.log(report)

await pool.end()

if (result.failures.length > 0) {
  process.exit(1)
}
