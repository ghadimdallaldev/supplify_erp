/**
 * Backfill audit_logs for existing seeded orders/products (no wipe).
 * Run: pnpm run seed:audit-backfill
 */
import 'dotenv/config'
import { pool } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isMainModule } from './lib/is-main.mjs'
import { backfillAllCommercialAuditLogs } from './seed/audit-demo-backfill.js'

async function main() {
  const client = await pool.connect()
  try {
    console.log('Backfilling tenant audit logs from existing orders/products…')
    const total = await backfillAllCommercialAuditLogs(client)
    console.log(`Done. Inserted ${total} audit log entries.`)
  } finally {
    client.release()
    await disconnectCache()
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
