import { query } from '../lib/db.js'

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
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

  if (!matchedRestaurantId && prospect.restaurant_name) {
    const namePattern = `%${prospect.restaurant_name.trim().toLowerCase()}%`
    let sql = `SELECT id, name FROM restaurant WHERE lower(name) LIKE $1`
    const params = [namePattern]
    if (prospect.area_region) {
      sql += ` AND (address_json->>'city' ILIKE $2 OR address_json->>'area' ILIKE $2)`
      params.push(`%${prospect.area_region.trim()}%`)
    }
    sql += ' LIMIT 1'
    const { rows } = await query(sql, params)
    if (rows.length) {
      matchedRestaurantId = rows[0].id
      signals.push({ type: 'name_fuzzy', restaurantId: rows[0].id, confidence: 'medium' })
    }
  }

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
  const results = []
  for (const row of rows) {
    results.push(await matchProspectRow(row))
  }
  return results
}

export async function listProspects(
  supplierId,
  { limit = 50, offset = 0, lifecycleStatus = null } = {}
) {
  const params = [supplierId]
  let statusClause = ''
  if (lifecycleStatus) {
    params.push(lifecycleStatus)
    statusClause = ` AND lifecycle_status = $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await query(
    `SELECT p.*, r.name AS matched_restaurant_name
     FROM supplier_customer_prospect p
     LEFT JOIN restaurant r ON r.id = p.matched_restaurant_id
     WHERE p.supplier_id = $1${statusClause}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM supplier_customer_prospect WHERE supplier_id = $1${statusClause}`,
    lifecycleStatus ? [supplierId, lifecycleStatus] : [supplierId]
  )
  return { prospects: rows, total: countRows[0]?.total ?? 0 }
}
