import { createHash } from 'node:crypto'

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])])
    )
  }
  return value
}

export function consumerCheckoutPayloadHash(payload) {
  const body = { ...payload }
  delete body.idempotencyKey
  return createHash('sha256')
    .update(JSON.stringify(canonical({ ...body, consumerMemberId: body.consumerMemberId ?? null })))
    .digest('hex')
}

export async function findConsumerCheckoutReplay(runQuery, restaurantId, key, hash) {
  if (!key) return null
  const { rows } = await runQuery(
    `SELECT payload_hash, consumer_order_id FROM consumer_checkout_attempt
     WHERE restaurant_id = $1 AND idempotency_key = $2`,
    [restaurantId, key]
  )
  if (!rows.length) return null
  if (rows[0].payload_hash !== hash) {
    throw Object.assign(
      new Error(
        'This checkout key was already used for a different order. Check your orders before trying again.'
      ),
      { name: 'IDEMPOTENCY_KEY_REUSED' }
    )
  }
  const { rows: orders } = await runQuery(
    `SELECT * FROM consumer_order WHERE id=$1 AND restaurant_id=$2`,
    [rows[0].consumer_order_id, restaurantId]
  )
  const { rows: lines } = await runQuery(
    `SELECT * FROM consumer_order_line WHERE order_id=$1 ORDER BY created_at`,
    [rows[0].consumer_order_id]
  )
  return { order: orders[0], lines, isNew: false }
}
