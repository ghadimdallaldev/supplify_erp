import { query } from '../lib/db.js'
import { blockedExistsSql, followExistsSql } from '../lib/relationship.js'

const MATCH_CONCURRENCY = 8

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

async function mapWithConcurrency(items, worker, concurrency = MATCH_CONCURRENCY) {
  const results = new Array(items.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        if (index >= items.length) return
        results[index] = await worker(items[index])
      }
    })
  )

  return results
}

export async function matchSingleProspect(prospectId) {
  const { rows } = await query(`SELECT * FROM supplier_customer_prospect WHERE id = $1`, [
    prospectId,
  ])
  if (!rows.length) return null
  return matchProspectRow(rows[0])
}

async function matchProspectRow(prospect) {
  const signals = []
  let matchedRestaurantId = null

  if (prospect.email) {
    const email = prospect.email.trim().toLowerCase()
    const { rows } = await query(
      `SELECT id, name FROM restaurant WHERE lower(trim(contact_email)) = $1 LIMIT 1`,
      [email]
    )
    if (rows.length) {
      matchedRestaurantId = rows[0].id
      signals.push({ type: 'email', restaurantId: rows[0].id, confidence: 'high' })
    }
  }

  if (!matchedRestaurantId && prospect.phone) {
    const phoneNorm = normalizePhone(prospect.phone)
    if (phoneNorm.length >= 7) {
      const { rows } = await query(
        `SELECT id, name FROM restaurant
         WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $1
         LIMIT 1`,
        [phoneNorm]
      )
      if (rows.length) {
        matchedRestaurantId = rows[0].id
        signals.push({ type: 'phone', restaurantId: rows[0].id, confidence: 'high' })
      }
    }
  }

  // Name and city are never used: only an exact normalised email or phone can match
  // (spec §6.2 item 1), so a name fragment never links a prospect to a restaurant.

  const matchStatus = matchedRestaurantId ? 'existing_supplify' : 'import_only'

  await query(
    `UPDATE supplier_customer_prospect SET
       match_status = $2,
       matched_restaurant_id = $3,
       match_signals = $4::jsonb,
       updated_at = now()
     WHERE id = $1`,
    [prospect.id, matchStatus, matchedRestaurantId, JSON.stringify(signals)]
  )

  return { prospectId: prospect.id, matchStatus, matchedRestaurantId, signals }
}

export async function matchProspectsForSupplier(supplierId, { batchId = null } = {}) {
  const params = [supplierId]
  let batchClause = ''
  if (batchId) {
    batchClause = ' AND import_batch_id = $2'
    params.push(batchId)
  }
  const { rows } = await query(
    `SELECT * FROM supplier_customer_prospect
     WHERE supplier_id = $1${batchClause}
     ORDER BY created_at ASC`,
    params
  )
  return mapWithConcurrency(rows, (row) => matchProspectRow(row))
}

export const PROSPECT_STATUSES = ['imported', 'invited', 'following']

/**
 * Supplier-facing prospect status. Matching results are never exposed: a prospect is
 * "following" only once the matched restaurant follows the supplier organisation (and has
 * not blocked it); otherwise it is "invited" once any invite went out, else "imported".
 */
const PROSPECT_STATUS_SQL = `CASE
    WHEN p.matched_restaurant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM supplier ps
      WHERE ps.id = p.supplier_id
        AND ${followExistsSql('p.matched_restaurant_id', 'ps')}
        AND NOT ${blockedExistsSql('p.matched_restaurant_id', 'ps')}
    ) THEN 'following'
    WHEN p.lifecycle_status = 'imported' THEN 'imported'
    ELSE 'invited'
  END`

/** Only the supplier's own input plus the derived status (Interfaces, Plan A Task 10). */
export const PROSPECT_VIEW_COLUMNS = `p.id, p.restaurant_name AS name, p.email, p.phone,
  p.contact_person, p.area_region, ${PROSPECT_STATUS_SQL} AS status,
  (SELECT max(gi.sent_at) FROM supplier_growth_invitation gi WHERE gi.prospect_id = p.id) AS invited_at`

export async function listProspects(
  supplierId,
  { limit = 50, offset = 0, lifecycleStatus = null, search = null } = {}
) {
  // Both queries read from supplier_customer_prospect aliased as `p`, so one set of
  // qualified clauses serves the page query and the count query alike.
  const filterParams = [supplierId]
  let filterClause = ''
  if (lifecycleStatus && PROSPECT_STATUSES.includes(lifecycleStatus)) {
    filterParams.push(lifecycleStatus)
    filterClause += ` AND (${PROSPECT_STATUS_SQL}) = $${filterParams.length}`
  }
  const trimmedSearch = typeof search === 'string' ? search.trim() : ''
  if (trimmedSearch) {
    filterParams.push(`%${trimmedSearch}%`)
    const i = filterParams.length
    filterClause += ` AND (p.restaurant_name ILIKE $${i} OR p.email ILIKE $${i} OR p.phone ILIKE $${i} OR p.contact_person ILIKE $${i})`
  }

  const params = [...filterParams, limit, offset]
  const { rows } = await query(
    `SELECT ${PROSPECT_VIEW_COLUMNS}
     FROM supplier_customer_prospect p
     WHERE p.supplier_id = $1${filterClause}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM supplier_customer_prospect p
     WHERE p.supplier_id = $1${filterClause}`,
    filterParams
  )
  return { prospects: rows, total: countRows[0]?.total ?? 0 }
}

/** One prospect in the supplier-safe view, or null when it is not this supplier's. */
export const PROSPECT_STATUS_SQL_FOR_METRICS = PROSPECT_STATUS_SQL

export async function getProspectView(supplierId, prospectId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${PROSPECT_VIEW_COLUMNS}
     FROM supplier_customer_prospect p
     WHERE p.id = $1 AND p.supplier_id = $2`,
    [prospectId, supplierId]
  )
  return rows[0] || null
}
