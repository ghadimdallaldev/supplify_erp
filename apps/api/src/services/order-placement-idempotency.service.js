import crypto from 'node:crypto'

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = stableValue(value[key])
        return result
      }, {})
  }
  return value
}

export function normalizeOrderPlacementPayload(payload) {
  const normalized = { ...(payload || {}) }
  for (const key of ['items', 'quoteLocks']) {
    if (Array.isArray(normalized[key])) {
      normalized[key] = [...normalized[key]].sort((a, b) =>
        String(a.productId ?? '').localeCompare(String(b.productId ?? ''))
      )
    }
  }
  return normalized
}

export function hashOrderPlacementPayload(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableValue(normalizeOrderPlacementPayload(payload))))
    .digest('hex')
}

export class IdempotencyConflictError extends Error {
  constructor(message, code = 'IDEMPOTENCY_CONFLICT') {
    super(message)
    this.name = code
    this.code = code
    this.status = 409
  }
}

export async function lookupOrderPlacementKey(dbQuery, { restaurantId, key, requestHash }) {
  if (!key) return null
  const normalizedKey = String(key).trim()
  if (normalizedKey.length < 8 || normalizedKey.length > 200) {
    throw new IdempotencyConflictError(
      'Idempotency-Key must contain between 8 and 200 characters',
      'INVALID_IDEMPOTENCY_KEY'
    )
  }
  const { rows } = await dbQuery(
    `SELECT id, request_hash, status, response_json
     FROM order_placement_idempotency
     WHERE restaurant_id = $1 AND idempotency_key = $2`,
    [restaurantId, normalizedKey]
  )
  const row = rows[0]
  if (!row) return null
  if (row.request_hash !== requestHash) {
    throw new IdempotencyConflictError(
      'This Idempotency-Key was already used for a different order request',
      'IDEMPOTENCY_PAYLOAD_MISMATCH'
    )
  }
  if (row.status === 'SUCCEEDED' && row.response_json) {
    return row.response_json
  }
  throw new IdempotencyConflictError(
    'An order placement with this key is already in progress',
    'IDEMPOTENCY_IN_PROGRESS'
  )
}

/**
 * Claim a restaurant-scoped placement key inside the order transaction.
 * PostgreSQL's unique constraint serializes concurrent first attempts. A
 * rolled-back order also rolls back its IN_PROGRESS claim, so retries remain
 * possible after failed placement.
 */
export async function claimOrderPlacementKey(client, { restaurantId, key, requestHash }) {
  if (!key) return { enabled: false, replay: null }

  const normalizedKey = String(key).trim()
  if (normalizedKey.length < 8 || normalizedKey.length > 200) {
    throw new IdempotencyConflictError(
      'Idempotency-Key must contain between 8 and 200 characters',
      'INVALID_IDEMPOTENCY_KEY'
    )
  }

  // Retain successful keys for six months, which comfortably covers delayed
  // mobile retries while keeping the table bounded. This uses the indexed
  // created_at column and is safe to run opportunistically during placement.
  await client.query(
    `DELETE FROM order_placement_idempotency
     WHERE status = 'SUCCEEDED' AND created_at < NOW() - INTERVAL '180 days'`
  )

  const { rows: inserted } = await client.query(
    `INSERT INTO order_placement_idempotency
       (restaurant_id, idempotency_key, request_hash, status)
     VALUES ($1, $2, $3, 'IN_PROGRESS')
     ON CONFLICT (restaurant_id, idempotency_key) DO NOTHING
     RETURNING id, status`,
    [restaurantId, normalizedKey, requestHash]
  )
  if (inserted.length) {
    return { enabled: true, replay: null, id: inserted[0].id, key: normalizedKey }
  }

  const { rows: existing } = await client.query(
    `SELECT id, request_hash, status, response_json
     FROM order_placement_idempotency
     WHERE restaurant_id = $1 AND idempotency_key = $2
     FOR UPDATE`,
    [restaurantId, normalizedKey]
  )
  const row = existing[0]
  if (!row) {
    throw new IdempotencyConflictError('Unable to acquire order placement key')
  }
  if (row.request_hash !== requestHash) {
    throw new IdempotencyConflictError(
      'This Idempotency-Key was already used for a different order request',
      'IDEMPOTENCY_PAYLOAD_MISMATCH'
    )
  }
  if (row.status === 'SUCCEEDED' && row.response_json) {
    return { enabled: true, replay: row.response_json, id: row.id, key: normalizedKey }
  }

  // A committed IN_PROGRESS row should be exceptionally rare because claims
  // are made in the same transaction as order creation. Do not expire it
  // aggressively: report a conflict so a delayed retry cannot duplicate an
  // order while an earlier request may still be completing.
  throw new IdempotencyConflictError(
    'An order placement with this key is already in progress',
    'IDEMPOTENCY_IN_PROGRESS'
  )
}

export async function completeOrderPlacementKey(client, claim, response) {
  if (!claim?.enabled || !claim.id) return
  await client.query(
    `UPDATE order_placement_idempotency
     SET status = 'SUCCEEDED', response_json = $2::jsonb, completed_at = NOW()
     WHERE id = $1 AND status = 'IN_PROGRESS'`,
    [claim.id, JSON.stringify(response)]
  )
}
