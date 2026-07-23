/**
 * Apply/verify 0191 against the running postgres_docker container (dev fallback
 * when localhost:5433 from .env.docker-sync is down).
 *
 * Creates DB `supplify` if missing, takes a logical count backup, applies 0191,
 * prints verification. Does not print passwords.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION_PATH = path.join(__dirname, '../db/migrations/0191_branch_account_link_invitations.sql')
const BACKUP_DIR = path.join(__dirname, '../../../.worktrees/db-backups')
const APPLY = process.argv.includes('--apply')

function dockerPw() {
  return execSync('docker exec postgres_docker printenv POSTGRES_PASSWORD', {
    encoding: 'utf8',
  }).trim()
}

async function main() {
  const password = dockerPw()
  const adminCs = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:5455/postgres`
  const admin = new pg.Client({ connectionString: adminCs })
  await admin.connect()

  const dbs = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'supplify'`)
  if (!dbs.rowCount) {
    await admin.query('CREATE DATABASE supplify')
    console.log('CREATED_DATABASE supplify on postgres_docker:5455')
  } else {
    console.log('DATABASE_EXISTS supplify on postgres_docker:5455')
  }
  await admin.end()

  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:5455/supplify`,
  })
  await client.connect()

  const preTables = await client.query(`
    SELECT
      to_regclass('public.restaurant') AS restaurant,
      to_regclass('public.subscription') AS subscription,
      to_regclass('public.restaurant_organizations') AS restaurant_organizations,
      to_regclass('public.branch_account_link_invitations') AS link_inv,
      to_regclass('public.central_purchasing_draft') AS cp_draft,
      to_regclass('public.branch_account_link_history') AS link_hist
  `)
  console.log('PRE_TABLES', preTables.rows[0])

  const preCols = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND (
        (table_name='subscription' AND column_name IN ('trial_target_plan_id','billing_review_required','org_billing_suspended_at','linked_billing_snapshot','billing_review_reason'))
        OR (table_name IN ('restaurant','supplier') AND column_name='deactivated_at')
      )
    ORDER BY 1,2
  `)
  console.log('PRE_COLS', preCols.rows)

  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const backupPath = path.join(
    BACKUP_DIR,
    `supplify-docker5455-pre-0191-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
  const backup = {
    createdAt: new Date().toISOString(),
    target: 'postgres_docker:5455/supplify',
    note: 'Logical schema/pre-check backup. Preferred localhost:5433 was unavailable.',
    preTables: preTables.rows[0],
    preCols: preCols.rows,
  }
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log('BACKUP', backupPath)

  // 0191 references restaurant_organizations, restaurant, app_user, customer_order.
  // On empty DB those FKs fail. Create minimal stubs if missing.
  if (!preTables.rows[0].restaurant_organizations) {
    console.log('MINIMAL_SCHEMA_BOOTSTRAP for empty DB verification')
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE IF NOT EXISTS app_user (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid()
      );
      CREATE TABLE IF NOT EXISTS restaurant_organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid()
      );
      CREATE TABLE IF NOT EXISTS restaurant (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID,
        is_branch_active BOOLEAN DEFAULT true,
        deactivated_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS supplier (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID,
        is_branch_active BOOLEAN DEFAULT true,
        deactivated_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS subscription (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        tenant_type VARCHAR(20)
      );
      CREATE TABLE IF NOT EXISTS customer_order (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid()
      );
    `)
  }

  if (!APPLY) {
    console.log('DRY_RUN_ONLY pass --apply to execute 0191')
    await client.end()
    return
  }

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('COMMIT')
    console.log('APPLY_OK')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('APPLY_FAILED', err.message)
    process.exitCode = 1
    await client.end()
    return
  }

  const post = await client.query(`
    SELECT
      to_regclass('public.branch_account_link_invitations') AS link_inv,
      to_regclass('public.branch_account_link_history') AS link_hist,
      to_regclass('public.central_purchasing_draft') AS cp_draft
  `)
  const postCols = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND (
        (table_name='subscription' AND column_name IN ('billing_review_required','billing_review_reason','linked_billing_snapshot','org_billing_suspended_at','trial_target_plan_id'))
        OR (table_name IN ('restaurant','supplier') AND column_name='deactivated_at')
      )
    ORDER BY 1,2
  `)

  let billingReviewCount = 0
  try {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM subscription WHERE billing_review_required = true`
    )
    billingReviewCount = r.rows[0].c
  } catch {
    billingReviewCount = null
  }

  console.log('POST_TABLES', post.rows[0])
  console.log('POST_COLS', postCols.rows)
  console.log(
    'MANUAL_REVIEW',
    JSON.stringify(
      {
        billing_review_required_rows: billingReviewCount,
        environment: 'fallback empty/minimal DB on postgres_docker:5455 (preferred :5433 down)',
        migration_0190_present: postCols.rows.some((r) => r.column_name === 'trial_target_plan_id'),
        sql_depends_on_0190: false,
        product_depends_on_0190: true,
        data_requiring_manual_review: [],
        note: 'No production tenant data on this fallback DB. Re-run against real supplify when localhost:5433 / local:infra is up.',
      },
      null,
      2
    )
  )

  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
