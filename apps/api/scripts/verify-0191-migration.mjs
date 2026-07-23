/**
 * Pre/post verification for migration 0191 against local development DB.
 * Usage: node scripts/verify-0191-migration.mjs [--apply]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { config } from '../src/config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const ROOT = path.resolve(__dirname, '../..')
const BACKUP_DIR = path.join(ROOT, '.worktrees', 'db-backups')
const MIGRATION_PATH = path.join(__dirname, '../db/migrations/0191_branch_account_link_invitations.sql')

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function snapshot(client, label) {
  const migrationTables = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('schema_migrations', 'schema_migration', 'migrations', '_migrations')
  `)

  let applied = []
  for (const { tablename } of migrationTables.rows) {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [tablename]
    )
    const names = cols.rows.map((r) => r.column_name)
    const versionCol = names.find((c) => /version|id|name|filename/i.test(c)) || names[0]
    const { rows } = await client.query(
      `SELECT * FROM ${tablename} WHERE CAST(${versionCol} AS text) ILIKE '%0190%'
         OR CAST(${versionCol} AS text) ILIKE '%0191%'
         OR CAST(${versionCol} AS text) ILIKE '%four_plan%'
         OR CAST(${versionCol} AS text) ILIKE '%branch_account%'
       ORDER BY 1`
    )
    applied.push({ table: tablename, rows })
  }

  const subscriptionCols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription'
      AND column_name IN (
        'trial_target_plan_id',
        'billing_review_required',
        'billing_review_reason',
        'linked_billing_snapshot',
        'org_billing_suspended_at'
      )
    ORDER BY 1
  `)

  const restaurantCols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='restaurant'
      AND column_name IN ('deactivated_at', 'organization_id', 'is_branch_active')
    ORDER BY 1
  `)

  const supplierCols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='supplier'
      AND column_name IN ('deactivated_at', 'organization_id', 'is_branch_active')
    ORDER BY 1
  `)

  const tables = await client.query(`
    SELECT to_regclass('public.branch_account_link_invitations') AS branch_account_link_invitations,
           to_regclass('public.branch_account_link_history') AS branch_account_link_history,
           to_regclass('public.central_purchasing_draft') AS central_purchasing_draft
  `)

  const reviewRows = await client.query(`
    SELECT COUNT(*)::int AS billing_review_required_count
    FROM subscription
    WHERE EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='subscription' AND column_name='billing_review_required'
    )
  `).catch(() => ({ rows: [{ billing_review_required_count: 'n/a' }] }))

  let billingReviewCount = null
  try {
    const hasCol = subscriptionCols.rows.some((r) => r.column_name === 'billing_review_required')
    if (hasCol) {
      const r = await client.query(
        `SELECT COUNT(*)::int AS c FROM subscription WHERE billing_review_required = true`
      )
      billingReviewCount = r.rows[0].c
    }
  } catch {
    billingReviewCount = null
  }

  const orphanCandidates = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM restaurant WHERE organization_id IS NOT NULL AND is_branch_active IS NULL) AS restaurant_null_active,
      (SELECT COUNT(*)::int FROM supplier WHERE organization_id IS NOT NULL AND is_branch_active IS NULL) AS supplier_null_active
  `)

  return {
    label,
    migrationTables: migrationTables.rows.map((r) => r.tablename),
    applied0190or0191: applied,
    subscriptionCols: subscriptionCols.rows.map((r) => r.column_name),
    restaurantCols: restaurantCols.rows.map((r) => r.column_name),
    supplierCols: supplierCols.rows.map((r) => r.column_name),
    tables: tables.rows[0],
    billingReviewRequiredCount: billingReviewCount,
    orphanCandidates: orphanCandidates.rows[0],
    note0190: subscriptionCols.rows.some((r) => r.column_name === 'trial_target_plan_id')
      ? '0190 trial_target_plan_id present'
      : '0190 trial_target_plan_id NOT present',
  }
}

async function logicalBackup(client, outPath) {
  const tables = [
    'restaurant',
    'supplier',
    'subscription',
    'restaurant_organizations',
    'supplier_organizations',
  ]
  const dump = { createdAt: new Date().toISOString(), counts: {}, samples: {} }
  for (const table of tables) {
    const exists = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`])
    if (!exists.rows[0].t) continue
    const count = await client.query(`SELECT COUNT(*)::int AS c FROM ${table}`)
    dump.counts[table] = count.rows[0].c
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2))
  return dump
}

async function main() {
  if (!config.DATABASE_URL) {
    console.error('NO_DATABASE_URL')
    process.exit(2)
  }

  const u = new URL(config.DATABASE_URL.replace(/^postgres(ql)?:\/\//, 'postgresql://'))
  console.log(
    'CONNECTING',
    JSON.stringify({
      host: u.hostname,
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, '').split('?')[0],
      user: u.username,
    })
  )

  const client = new pg.Client({ connectionString: config.DATABASE_URL })
  await client.connect()

  try {
    const pre = await snapshot(client, 'pre')
    console.log('PRE', JSON.stringify(pre, null, 2))

    const backupPath = path.join(BACKUP_DIR, `supplify-logical-pre-0191-${stamp()}.json`)
    const backup = await logicalBackup(client, backupPath)
    console.log('LOGICAL_BACKUP', backupPath, JSON.stringify(backup.counts))

    if (!APPLY) {
      console.log('DRY_RUN_ONLY pass --apply to execute 0191 SQL')
      return
    }

    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      // Record in schema_migrations if that table exists with a filename/version column
      const hasSchema = await client.query(
        `SELECT to_regclass('public.schema_migrations') AS t`
      )
      if (hasSchema.rows[0].t) {
        const cols = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name='schema_migrations'`
        )
        const names = cols.rows.map((r) => r.column_name)
        if (names.includes('version') && names.includes('name')) {
          await client.query(
            `INSERT INTO schema_migrations (version, name, applied_at)
             VALUES ('0191', '0191_branch_account_link_invitations.sql', NOW())
             ON CONFLICT DO NOTHING`
          ).catch(async () => {
            await client.query(
              `INSERT INTO schema_migrations (version, name)
               SELECT '0191', '0191_branch_account_link_invitations.sql'
               WHERE NOT EXISTS (
                 SELECT 1 FROM schema_migrations WHERE version = '0191' OR name ILIKE '%0191_branch_account%'
               )`
            )
          })
        } else if (names.includes('filename')) {
          await client.query(
            `INSERT INTO schema_migrations (filename)
             SELECT '0191_branch_account_link_invitations.sql'
             WHERE NOT EXISTS (
               SELECT 1 FROM schema_migrations WHERE filename ILIKE '%0191_branch_account%'
             )`
          )
        }
      }
      await client.query('COMMIT')
      console.log('APPLY_OK')
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('APPLY_FAILED', err.message)
      process.exitCode = 1
      return
    }

    const post = await snapshot(client, 'post')
    console.log('POST', JSON.stringify(post, null, 2))

    const manualReview = {
      billing_review_required_rows: post.billingReviewRequiredCount,
      restaurant_null_is_branch_active: post.orphanCandidates.restaurant_null_active,
      supplier_null_is_branch_active: post.orphanCandidates.supplier_null_active,
      depends_on_0190_sql: false,
      depends_on_0190_product: true,
      note:
        '0191 SQL does not reference 0190 objects. Product Branch Account limits still expect four-plan catalog from 0190. central_purchasing_draft is in same migration as link invitations (shared schema for groups 2 and 3).',
    }
    console.log('MANUAL_REVIEW', JSON.stringify(manualReview, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
