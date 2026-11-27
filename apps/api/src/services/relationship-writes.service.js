/**
 * Every write that creates or removes a restaurant → supplier-organisation relationship.
 *
 * Each write runs in one transaction: exclusive `rel:<restaurant>:<org>` lock, then (follows
 * only) the `follow-cap:<restaurant>` lock, then the check, then the write. After commit the
 * relationship hooks run (cache invalidation, socket revocation) before the caller responds.
 * Blocks always win: blocking deletes the follow, and following a blocked organisation is
 * refused until the restaurant unblocks it.
 */
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { checkLimit } from '../lib/subscription.js'
import {
  RelationshipError,
  emitRelationshipChanged,
  lockRelationshipExclusive,
} from '../lib/relationship.js'

export class SupplierBlockedError extends RelationshipError {
  constructor() {
    super('SUPPLIER_BLOCKED', 'Unblock this supplier to follow it', 409)
  }
}

export class SupplierFollowLimitError extends RelationshipError {
  constructor({ current, limit }) {
    super(
      'SUPPLIER_FOLLOW_LIMIT_REACHED',
      `You have reached your plan limit for followed suppliers (${limit}). Upgrade your plan to follow more suppliers.`,
      403,
      { current, limit, requiredPlan: 'Growth' }
    )
  }
}

export class SupplierNotFoundError extends RelationshipError {
  constructor() {
    super('NOT_FOUND', 'Resource not found', 404)
  }
}

const FOLLOW_SOURCES = new Set(['manual', 'invite', 'referral'])

async function resolveTarget(db, supplierId) {
  const { rows } = await db.query(
    `SELECT s.organization_id AS org_id, s.name,
            (SELECT m.id FROM supplier m
             WHERE m.organization_id = s.organization_id
             ORDER BY m.is_main_branch DESC, m.created_at ASC LIMIT 1) AS main_id
     FROM supplier s WHERE s.id = $1`,
    [supplierId]
  )
  if (!rows[0]?.org_id) throw new SupplierNotFoundError()
  return { orgId: rows[0].org_id, mainId: rows[0].main_id || supplierId, name: rows[0].name }
}

async function readState(db, restaurantId, orgId) {
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM supplier_blocklist WHERE restaurant_id = $1 AND supplier_org_id = $2) AS blocked,
            EXISTS (SELECT 1 FROM supplier_follow WHERE restaurant_id = $1 AND supplier_org_id = $2) AS following`,
    [restaurantId, orgId]
  )
  return { blocked: rows[0]?.blocked === true, following: rows[0]?.following === true }
}

/**
 * Run `work(client)` in its own transaction and emit the change after commit, or inside the
 * caller's transaction (`client` given) and return the event for the caller to emit.
 */
async function runWrite(client, work) {
  if (client) return work(client)
  const result = await withTransaction(work)
  if (result.event) await emitRelationshipChanged(result.event)
  return result
}

/**
 * @param {{ restaurantId: string, supplierId: string, source?: 'manual'|'invite'|'referral' }} input
 * @param {{ query: Function }} [client] caller's open transaction
 */
export async function followSupplier({ restaurantId, supplierId, source = 'manual' }, client) {
  if (!FOLLOW_SOURCES.has(source)) throw new Error(`Unknown follow source: ${source}`)
  const limitCheck = await checkLimit(restaurantId, 'RESTAURANT', 'suppliers_per_restaurant')
  const capped = !limitCheck?.isUnlimited && Number.isFinite(Number(limitCheck?.limit))
  return runWrite(client, async (db) => {
    const target = await resolveTarget(db, supplierId)
    await lockRelationshipExclusive(db, restaurantId, target.orgId)
    const state = await readState(db, restaurantId, target.orgId)
    if (state.blocked) throw new SupplierBlockedError()
    if (state.following) {
      return { followed: true, alreadyFollowing: true, supplierOrgId: target.orgId, event: null }
    }
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended('follow-cap:' || $1, 0))`, [
      restaurantId,
    ])
    const { rows } = await db.query(
      'SELECT count(*)::int AS count FROM supplier_follow WHERE restaurant_id = $1',
      [restaurantId]
    )
    const current = Number(rows[0]?.count ?? 0)
    if (capped && current >= Number(limitCheck.limit)) {
      throw new SupplierFollowLimitError({ current, limit: Number(limitCheck.limit) })
    }
    await db.query(
      `INSERT INTO supplier_follow (restaurant_id, supplier_id, supplier_org_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (restaurant_id, supplier_org_id) DO NOTHING`,
      [restaurantId, target.mainId, target.orgId]
    )
    logger.info('Supplier followed', { restaurantId, supplierOrgId: target.orgId, source })
    return {
      followed: true,
      alreadyFollowing: false,
      supplierOrgId: target.orgId,
      event: { restaurantId, supplierOrgId: target.orgId, kind: 'follow' },
    }
  })
}

export async function unfollowSupplier({ restaurantId, supplierId }, client) {
  return runWrite(client, async (db) => {
    const target = await resolveTarget(db, supplierId)
    await lockRelationshipExclusive(db, restaurantId, target.orgId)
    const { rowCount } = await db.query(
      'DELETE FROM supplier_follow WHERE restaurant_id = $1 AND supplier_org_id = $2',
      [restaurantId, target.orgId]
    )
    return {
      unfollowed: true,
      supplierOrgId: target.orgId,
      event: rowCount ? { restaurantId, supplierOrgId: target.orgId, kind: 'unfollow' } : null,
    }
  })
}

export async function blockSupplier({ restaurantId, supplierId, reason = null }, client) {
  return runWrite(client, async (db) => {
    const target = await resolveTarget(db, supplierId)
    await lockRelationshipExclusive(db, restaurantId, target.orgId)
    await db.query(
      'DELETE FROM supplier_follow WHERE restaurant_id = $1 AND supplier_org_id = $2',
      [restaurantId, target.orgId]
    )
    const { rowCount } = await db.query(
      `INSERT INTO supplier_blocklist (restaurant_id, supplier_id, supplier_org_id, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (restaurant_id, supplier_org_id) DO NOTHING`,
      [restaurantId, target.mainId, target.orgId, reason || null]
    )
    logger.info('Supplier blocked', { restaurantId, supplierOrgId: target.orgId })
    return {
      blocked: true,
      alreadyBlocked: !rowCount,
      supplierOrgId: target.orgId,
      event: { restaurantId, supplierOrgId: target.orgId, kind: 'block' },
    }
  })
}

export async function unblockSupplier({ restaurantId, supplierId }, client) {
  return runWrite(client, async (db) => {
    const target = await resolveTarget(db, supplierId)
    await lockRelationshipExclusive(db, restaurantId, target.orgId)
    const { rowCount } = await db.query(
      'DELETE FROM supplier_blocklist WHERE restaurant_id = $1 AND supplier_org_id = $2',
      [restaurantId, target.orgId]
    )
    return {
      unblocked: true,
      supplierOrgId: target.orgId,
      event: rowCount ? { restaurantId, supplierOrgId: target.orgId, kind: 'unblock' } : null,
    }
  })
}

/** Follow count used by entitlements/usage (one row per organisation). */
export async function countFollowedOrganizations(restaurantId, db = query) {
  const { rows } = await db(
    'SELECT count(*)::int AS c FROM supplier_follow WHERE restaurant_id = $1',
    [restaurantId]
  )
  return Number(rows[0]?.c ?? 0)
}
