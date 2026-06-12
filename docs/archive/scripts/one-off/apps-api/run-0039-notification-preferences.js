/**
 * One-off: apply 0039_notification_preferences_user_schema.sql so notification_preferences has user_id.
 * Run with: node scripts/run-0039-notification-preferences.js
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { query } from '../src/lib/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const sql = readFileSync(
    join(__dirname, '../db/migrations/0039_notification_preferences_user_schema.sql'),
    'utf8'
  )
  await query(sql)
  console.log('✓ 0039 notification_preferences schema applied')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
