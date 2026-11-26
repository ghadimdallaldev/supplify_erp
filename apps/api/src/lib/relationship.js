/**
 * Restaurant ↔ supplier relationship rules (marketplace visibility).
 *
 * A relationship is stored per (restaurant tenant row, supplier organisation): supplier_follow
 * and supplier_blocklist are keyed on supplier_org_id. These helpers only answer whether a
 * relationship exists — branch RBAC, warehouse guards and tenant isolation still decide what
 * each user may see. A block always wins over a follow.
 *
 * Locks: follow/unfollow/block/unblock take the exclusive `rel:<restaurant>:<org>` transaction
 * advisory lock; writes that depend on the relationship (orders, messages, contract prices,
 * sponsorship offers, quote → order) take the shared variant and re-check in the same
 * transaction. Several orgs → lock in ascending org id. The follow-cap lock comes after.
 */
import { query } from './db.js'
import { logger } from './logger.js'

export const OPEN_ORDER_STATUSES = Object.freeze([
  'PENDING_APPROVAL',
  'PLACED',
  'ACKNOWLEDGED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'RECEIVED_PARTIAL',
  'RECEIVED_WITH_DISPUTE',
])

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertIdent(alias) {
  if (!IDENT_RE.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`)
  return alias
}

function run(db) {
  if (!db) return query
  if (typeof db.query === 'function') return (sql, params) => db.query(sql, params)
  return db
}

/** SQL expression for the supplier organisation id of the supplier row `alias`. */
export function supplierOrgIdSql(alias) {
  assertIdent(alias)
  return `COALESCE(${alias}.organization_id, ${alias}.id)`
}

/** EXISTS(...) — `restaurantExpr` follows the organisation of supplier row `supplierAlias`. */
export function followExistsSql(restaurantExpr, supplierAlias) {
  const a = `rel_f_${assertIdent(supplierAlias)}`
  return `EXISTS (SELECT 1 FROM supplier_follow ${a} WHERE ${a}.restaurant_id = ${restaurantExpr} AND ${a}.supplier_org_id = ${supplierOrgIdSql(supplierAlias)})`
}

/** EXISTS(...) — `restaurantExpr` blocked the organisation of supplier row `supplierAlias`. */
export function blockedExistsSql(restaurantExpr, supplierAlias) {
  const a = `rel_b_${assertIdent(supplierAlias)}`
  return `EXISTS (SELECT 1 FROM supplier_blocklist ${a} WHERE ${a}.restaurant_id = ${restaurantExpr} AND ${a}.supplier_org_id = ${supplierOrgIdSql(supplierAlias)})`
}

/** Catalog (products, prices, deals) of `supplierAlias` is visible to `restaurantExpr`. */
export function catalogVisibleSql(restaurantExpr, supplierAlias) {
  return `(NOT ${blockedExistsSql(restaurantExpr, supplierAlias)} AND (${followExistsSql(restaurantExpr, supplierAlias)} OR ${assertIdent(supplierAlias)}.public_catalog_enabled))`
}

export async function resolveSupplierOrgId(supplierId, db) {
  if (!supplierId) return null
  const { rows } = await run(db)(
    `SELECT ${supplierOrgIdSql('s')} AS org_id FROM supplier s WHERE s.id = $1`,
    [supplierId]
  )
  return rows[0]?.org_id ?? null
}

/** @returns {Promise<{ orgId: string|null, following: boolean, blocked: boolean, publicCatalog: boolean }>} */
export async function getRelationship(restaurantId, supplierId, db) {
  const { rows } = await run(db)(
    `SELECT ${supplierOrgIdSql('s')} AS org_id,
            ${followExistsSql('$1', 's')} AS following,
            ${blockedExistsSql('$1', 's')} AS blocked,
            s.public_catalog_enabled AS public_catalog
     FROM supplier s WHERE s.id = $2`,
    [restaurantId, supplierId]
  )
  const row = rows[0]
  if (!row) return { orgId: null, following: false, blocked: false, publicCatalog: false }
  return {
    orgId: row.org_id,
    following: row.following === true,
    blocked: row.blocked === true,
    publicCatalog: row.public_catalog === true,
  }
}

export async function canTransact(restaurantId, supplierId, db) {
  const r = await getRelationship(restaurantId, supplierId, db)
  return r.following && !r.blocked
}

export async function canViewCatalog(restaurantId, supplierId, db) {
  const r = await getRelationship(restaurantId, supplierId, db)
  return Boolean(r.orgId) && !r.blocked && (r.following || r.publicCatalog)
}

/**
 * Which of `supplierIds` the restaurant may transact with (follow and not blocked).
 * @returns {Promise<{ allowed: Set<string>, missing: Array<{ id: string, name: string|null }> }>}
 */
export async function transactableSupplierIds(restaurantId, supplierIds, db) {
  const ids = [...new Set((supplierIds || []).filter(Boolean))]
  const allowed = new Set()
  if (!ids.length) return { allowed, missing: [] }
  const { rows } = await run(db)(
    `SELECT s.id, s.name,
            ${followExistsSql('$1', 's')} AS following,
            ${blockedExistsSql('$1', 's')} AS blocked
     FROM supplier s WHERE s.id = ANY($2::uuid[])`,
    [restaurantId, ids]
  )
  const byId = new Map(rows.map((r) => [r.id, r]))
  const missing = []
  for (const id of ids) {
    const row = byId.get(id)
    if (row && row.following === true && row.blocked !== true) allowed.add(id)
    else missing.push({ id, name: row?.name ?? null })
  }
  return { allowed, missing }
}

const LOCK_KEY_SQL = "hashtextextended('rel:' || $1 || ':' || $2, 0)"

export async function lockRelationshipShared(client, restaurantId, supplierOrgId) {
  await client.query(`SELECT pg_advisory_xact_lock_shared(${LOCK_KEY_SQL})`, [
    restaurantId,
    supplierOrgId,
  ])
}

export async function lockRelationshipExclusive(client, restaurantId, supplierOrgId) {
  await client.query(`SELECT pg_advisory_xact_lock(${LOCK_KEY_SQL})`, [restaurantId, supplierOrgId])
}

/** Shared locks for several organisations, always in ascending org id (no deadlocks). */
export async function lockRelationshipsShared(client, restaurantId, supplierOrgIds) {
  const sorted = [...new Set((supplierOrgIds || []).filter(Boolean))].sort()
  for (const orgId of sorted) await lockRelationshipShared(client, restaurantId, orgId)
}

export function restaurantNotAvailable(res, req) {
  return res.status(404).json({
    ok: false,
    data: null,
    error: { name: 'RESTAURANT_NOT_AVAILABLE', message: 'Restaurant not available' },
    requestId: req?.requestId,
  })
}

export function followRequired(res, req, suppliers) {
  return res.status(403).json({
    ok: false,
    data: null,
    error: {
      name: 'FOLLOW_REQUIRED',
      message: 'Follow this supplier to continue',
      details: { suppliers: (suppliers || []).map((s) => ({ id: s.id, name: s.name ?? null })) },
    },
    requestId: req?.requestId,
  })
}

/** Error class for service-level code; the error handler maps it to the same 403 body. */
export class FollowRequiredError extends Error {
  constructor(suppliers) {
    super('Follow this supplier to continue')
    this.name = 'FOLLOW_REQUIRED'
    this.statusCode = 403
    this.details = { suppliers: (suppliers || []).map((s) => ({ id: s.id, name: s.name ?? null })) }
  }
}

const hooks = []

/** Register `fn({ restaurantId, supplierOrgId, kind })`, awaited after every relationship change. */
export function onRelationshipChanged(fn) {
  hooks.push(fn)
  return () => {
    const i = hooks.indexOf(fn)
    if (i >= 0) hooks.splice(i, 1)
  }
}

/**
 * Run every hook (cache invalidation, socket revocation) before the caller responds.
 * The relationship change is already committed, so a failing hook is logged, not thrown.
 * kind: 'follow' | 'unfollow' | 'block' | 'unblock' | 'rekey'
 */
export async function emitRelationshipChanged(event) {
  for (const fn of [...hooks]) {
    try {
      await fn(event)
    } catch (error) {
      logger.error('Relationship change hook failed', {
        kind: event?.kind,
        error: error?.message,
      })
    }
  }
}

export function resetRelationshipHooksForTests() {
  hooks.length = 0
}

/**
 * Move every follow and block of organisation `fromOrgId` to `toOrgId` (a supplier joined
 * another organisation). Runs inside the caller's transaction; takes the exclusive lock for
 * both pairs of every affected restaurant in org-id order. Duplicates keep the earliest row;
 * a follow that would coexist with a block is dropped. Returns the affected restaurant ids.
 */
export async function rekeyRelationshipsToOrg(client, fromOrgId, toOrgId) {
  if (!fromOrgId || !toOrgId || fromOrgId === toOrgId) return []
  const { rows } = await client.query(
    `SELECT DISTINCT restaurant_id FROM (
       SELECT restaurant_id FROM supplier_follow WHERE supplier_org_id = $1
       UNION SELECT restaurant_id FROM supplier_blocklist WHERE supplier_org_id = $1) x
     ORDER BY restaurant_id`,
    [fromOrgId]
  )
  const restaurantIds = rows.map((r) => r.restaurant_id)
  const [first, second] = [fromOrgId, toOrgId].sort()
  for (const restaurantId of restaurantIds) {
    await lockRelationshipExclusive(client, restaurantId, first)
    await lockRelationshipExclusive(client, restaurantId, second)
  }
  if (!restaurantIds.length) return []
  for (const table of ['supplier_follow', 'supplier_blocklist']) {
    await client.query(
      `DELETE FROM ${table} old USING ${table} keep
       WHERE old.supplier_org_id = $1 AND keep.supplier_org_id = $2
         AND keep.restaurant_id = old.restaurant_id AND keep.created_at <= old.created_at`,
      [fromOrgId, toOrgId]
    )
    await client.query(
      `DELETE FROM ${table} newer USING ${table} old
       WHERE newer.supplier_org_id = $2 AND old.supplier_org_id = $1
         AND newer.restaurant_id = old.restaurant_id`,
      [fromOrgId, toOrgId]
    )
    await client.query(`UPDATE ${table} SET supplier_org_id = $2 WHERE supplier_org_id = $1`, [
      fromOrgId,
      toOrgId,
    ])
  }
  await client.query(
    `DELETE FROM supplier_follow f USING supplier_blocklist b
     WHERE f.supplier_org_id = $1 AND b.supplier_org_id = $1 AND b.restaurant_id = f.restaurant_id`,
    [toOrgId]
  )
  return restaurantIds
}
