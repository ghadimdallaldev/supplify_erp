/**
 * Real-PostgreSQL harness for marketplace visibility / categories integration tests.
 * See README.md for the container command. Every API module is imported dynamically AFTER
 * ./env.js has pointed apps/api/src/lib/db.js at the isolated database.
 */
import './env.js'
import http from 'node:http'
import { createRequire } from 'node:module'
import { makeTestToken } from './auth-mock.js'

const requireFromApi = createRequire(new URL('../../../apps/api/package.json', import.meta.url))
const express = requireFromApi('express')

/** Tables whose rows must never be removed between tests: the root tenant tables are
 * truncated with CASCADE, and seeded reference rows wiped by that cascade (e.g. the platform
 * product_category tree) are restored from a snapshot taken right after migrations. */
const ROOT_TABLES = [
  'app_user',
  'restaurant',
  'supplier',
  'supplier_organizations',
  'restaurant_organizations',
]
const SNAPSHOT_SCHEMA = 'mkt_harness_snapshot'

let started = null

async function snapshotSeededTables(pool) {
  await pool.query(`DROP SCHEMA IF EXISTS ${SNAPSHOT_SCHEMA} CASCADE`)
  await pool.query(`CREATE SCHEMA ${SNAPSHOT_SCHEMA}`)
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
  )
  const seeded = []
  for (const { tablename } of rows) {
    const { rows: c } = await pool.query(`SELECT EXISTS (SELECT 1 FROM public."${tablename}") AS x`)
    if (!c[0].x || ROOT_TABLES.includes(tablename)) continue
    await pool.query(
      `CREATE TABLE ${SNAPSHOT_SCHEMA}."${tablename}" AS SELECT * FROM public."${tablename}"`
    )
    seeded.push(tablename)
  }
  return seeded
}

export async function startMarketplaceDb() {
  if (!started) {
    started = (async () => {
      const { pool } = await import('../../../apps/api/src/lib/db.js')
      const { rows } = await pool.query('SELECT current_database() AS db, inet_server_addr() AS h')
      if (rows[0].db !== 'marketplace_audit') {
        throw new Error(`Harness connected to ${rows[0].db}; refusing to continue`)
      }
      const { runFullStartupMigrations } = await import(
        '../../../apps/api/src/lib/startup-migrations.js'
      )
      await runFullStartupMigrations({ force: true })
      const seeded = await snapshotSeededTables(pool)
      return { pool, url: process.env.SUPPLIFY_DATABASE_URL, seeded }
    })()
  }
  return started
}

/** Remove all business rows; restore migration-seeded reference rows the cascade removed. */
export async function resetMarketplaceDb(pool) {
  const { seeded } = await startMarketplaceDb()
  const existing = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [ROOT_TABLES]
  )
  const roots = existing.rows.map((r) => `public."${r.tablename}"`).join(', ')
  await pool.query(`TRUNCATE ${roots} CASCADE`)
  const pending = []
  for (const table of seeded) {
    const { rows } = await pool.query(`SELECT EXISTS (SELECT 1 FROM public."${table}") AS x`)
    if (!rows[0].x) pending.push(table)
  }
  // Restore in dependency order by retrying FK failures (small set in practice).
  for (let attempt = 0; pending.length && attempt < 10; attempt++) {
    for (const table of [...pending]) {
      try {
        await pool.query(
          `INSERT INTO public."${table}" SELECT * FROM ${SNAPSHOT_SCHEMA}."${table}"`
        )
        pending.splice(pending.indexOf(table), 1)
      } catch (error) {
        if (error.code !== '23503') throw error
      }
    }
  }
  if (pending.length) throw new Error(`Could not restore seeded tables: ${pending.join(', ')}`)
  const { clearMemoryCacheForTests } = await import('../../../apps/api/src/lib/cache.js').catch(
    () => ({})
  )
  if (typeof clearMemoryCacheForTests === 'function') clearMemoryCacheForTests()
}

/** Authorization header for a fixture user sub. */
export function authHeaders(sub) {
  return { authorization: `Bearer ${makeTestToken(sub)}` }
}

/**
 * Mount createApp() + socket.io on an ephemeral port. A request carrying `x-test-user: <sub>`
 * is authenticated as that app_user (requires the test file to mock lib/auth.js with
 * ./auth-mock.js withTestAuth).
 */
export async function startApiForTest() {
  await startMarketplaceDb()
  const { createApp } = await import('../../../apps/api/src/app.js')
  const { markStartupMigrationsReady } = await import(
    '../../../apps/api/src/lib/startup-readiness.js'
  )
  const { initializeSocket } = await import('../../../apps/api/src/lib/socket.js')
  markStartupMigrationsReady()

  const outer = express()
  outer.use((req, _res, next) => {
    const sub = req.headers['x-test-user']
    if (typeof sub === 'string' && sub) {
      req.headers.authorization = `Bearer ${makeTestToken(sub)}`
    }
    next()
  })
  outer.use(createApp())
  const server = http.createServer(outer)
  const io = await initializeSocket(server).then(async () => {
    const { getIO } = await import('../../../apps/api/src/lib/socket.js')
    return getIO()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`
  return {
    app: outer,
    server,
    io,
    baseUrl,
    close: async () => {
      await new Promise((resolve) => io.close(() => resolve()))
      if (server.listening) await new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
