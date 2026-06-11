import { query } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { logger } from '../lib/logger.js'

const DEFAULT_FULFILLMENT_MULTIPLIERS = {
  TAKEAWAY: 1,
  DELIVERY: 1.25,
  DINE_IN: 1.5,
  pickup: 1,
  delivery: 1.25,
  dine_in: 1.5,
}

function normalizeFulfillmentKey(fulfillmentType) {
  const raw = String(fulfillmentType || 'TAKEAWAY').toUpperCase()
  if (raw === 'PICKUP') return 'TAKEAWAY'
  return raw
}

export function getFulfillmentMultiplier(rulesJson, fulfillmentType) {
  const multipliers =
    rulesJson?.fulfillment_multipliers ||
    rulesJson?.fulfillmentMultipliers ||
    DEFAULT_FULFILLMENT_MULTIPLIERS
  const key = normalizeFulfillmentKey(fulfillmentType)
  const lower = key.toLowerCase()
  const multiplier = Number(
    multipliers[key] ?? multipliers[lower] ?? multipliers.TAKEAWAY ?? multipliers.pickup ?? 1
  )
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1
}

function mapSupplierProgramRow(row) {
  if (!row) return null
  return {
    ...row,
    earn_points_per_currency: Number(row.earn_points_per_currency),
    redeem_currency_per_point: Number(row.redeem_currency_per_point),
    max_redeem_percent: Number(row.max_redeem_percent),
    rules_json: row.rules_json || {},
  }
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100
}

function mapConsumerProgramRow(row) {
  if (!row) return null
  return {
    ...row,
    earn_points_per_currency: Number(row.earn_points_per_currency),
    redeem_currency_per_point: Number(row.redeem_currency_per_point),
    min_redeem_points: Number(row.min_redeem_points),
    welcome_bonus_points: Number(row.welcome_bonus_points ?? 0),
    max_redeem_percent: Number(row.max_redeem_percent ?? 50),
    rules_json: row.rules_json || {},
  }
}

export function computeEarnPoints(program, spendAmount, options = {}) {
  if (!program?.enabled) return 0
  const rate = Number(program.earn_points_per_currency) || 0
  if (rate <= 0 || spendAmount <= 0) return 0
  let points = Math.floor(spendAmount * rate)
  const multiplier = options.fulfillmentType
    ? getFulfillmentMultiplier(program.rules_json, options.fulfillmentType)
    : 1
  points = Math.floor(points * multiplier)
  return Math.max(0, points)
}

export function computeRedeemValue(program, points) {
  const rate = Number(program.redeem_currency_per_point) || 0
  return Math.max(0, points * rate)
}

async function getOrCreateBalance(client, supplierId, restaurantId) {
  const q = client?.query ? client.query.bind(client) : query
  const { rows } = await q(
    `
    INSERT INTO restaurant_loyalty_balance (supplier_id, restaurant_id)
    VALUES ($1, $2)
    ON CONFLICT (supplier_id, restaurant_id) DO UPDATE
      SET updated_at = restaurant_loyalty_balance.updated_at
    RETURNING *
    `,
    [supplierId, restaurantId]
  )
  return rows[0]
}

export async function getSupplierLoyaltyProgram(supplierId) {
  const { rows } = await query(`SELECT * FROM supplier_loyalty_program WHERE supplier_id = $1`, [
    supplierId,
  ])
  return mapSupplierProgramRow(rows[0])
}

export async function upsertSupplierLoyaltyProgram(supplierId, payload) {
  const {
    name = 'Loyalty Program',
    enabled = false,
    earnPointsPerCurrency = 1,
    redeemCurrencyPerPoint = 0.01,
    minRedeemPoints = 100,
    maxRedeemPercent = 50,
    rulesJson = {},
  } = payload

  const { rows } = await query(
    `
    INSERT INTO supplier_loyalty_program (
      supplier_id, name, enabled,
      earn_points_per_currency, redeem_currency_per_point,
      min_redeem_points, max_redeem_percent, rules_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    ON CONFLICT (supplier_id) DO UPDATE SET
      name = EXCLUDED.name,
      enabled = EXCLUDED.enabled,
      earn_points_per_currency = EXCLUDED.earn_points_per_currency,
      redeem_currency_per_point = EXCLUDED.redeem_currency_per_point,
      min_redeem_points = EXCLUDED.min_redeem_points,
      max_redeem_percent = EXCLUDED.max_redeem_percent,
      rules_json = EXCLUDED.rules_json,
      updated_at = NOW()
    RETURNING *
    `,
    [
      supplierId,
      name,
      enabled,
      earnPointsPerCurrency,
      redeemCurrencyPerPoint,
      minRedeemPoints,
      maxRedeemPercent,
      JSON.stringify(rulesJson),
    ]
  )
  return mapSupplierProgramRow(rows[0])
}

export async function getRestaurantLoyaltyBalance(supplierId, restaurantId) {
  const program = await getSupplierLoyaltyProgram(supplierId)
  const { rows } = await query(
    `
    SELECT * FROM restaurant_loyalty_balance
    WHERE supplier_id = $1 AND restaurant_id = $2
    `,
    [supplierId, restaurantId]
  )
  const balance = rows[0] || {
    supplier_id: supplierId,
    restaurant_id: restaurantId,
    points_balance: 0,
    lifetime_earned: 0,
    lifetime_redeemed: 0,
  }
  return { program, balance }
}

export async function listRestaurantLoyaltyBalances(restaurantId) {
  const { rows } = await query(
    `
    SELECT
      b.*,
      s.name AS supplier_name,
      p.enabled AS program_enabled,
      p.name AS program_name
    FROM restaurant_loyalty_balance b
    JOIN supplier s ON s.id = b.supplier_id
    LEFT JOIN supplier_loyalty_program p ON p.supplier_id = b.supplier_id
    WHERE b.restaurant_id = $1
    ORDER BY b.points_balance DESC, s.name ASC
    `,
    [restaurantId]
  )
  return rows
}

export async function listSupplierLoyaltyBalances(supplierId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `
    SELECT
      b.*,
      r.name AS restaurant_name
    FROM restaurant_loyalty_balance b
    JOIN restaurant r ON r.id = b.restaurant_id
    WHERE b.supplier_id = $1
    ORDER BY b.points_balance DESC, r.name ASC
    LIMIT $2 OFFSET $3
    `,
    [supplierId, limit, offset]
  )
  return rows
}

export async function getLoyaltyLedger(supplierId, restaurantId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `
    SELECT * FROM loyalty_ledger
    WHERE supplier_id = $1 AND restaurant_id = $2
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
    `,
    [supplierId, restaurantId, limit, offset]
  )
  return rows
}

export async function validateLoyaltyRedeem({
  supplierId,
  restaurantId,
  pointsToRedeem,
  orderSubtotal,
}) {
  const points = Number(pointsToRedeem)
  if (!Number.isInteger(points) || points <= 0) {
    throw new ValidationError('Points to redeem must be a positive integer')
  }

  const program = await getSupplierLoyaltyProgram(supplierId)
  if (!program?.enabled) {
    throw new ValidationError('Loyalty program is not enabled for this supplier')
  }

  if (points < program.min_redeem_points) {
    throw new ValidationError(`Minimum redeem is ${program.min_redeem_points} points`)
  }

  const { balance } = await getRestaurantLoyaltyBalance(supplierId, restaurantId)
  if (points > Number(balance.points_balance || 0)) {
    throw new ValidationError('Insufficient loyalty points')
  }

  const discountValue = computeRedeemValue(program, points)
  const subtotal = Number(orderSubtotal || 0)
  const maxByPercent = subtotal * (Number(program.max_redeem_percent) / 100)
  if (subtotal > 0 && discountValue > maxByPercent) {
    throw new ValidationError(
      `Redemption exceeds maximum ${program.max_redeem_percent}% of order subtotal`
    )
  }

  return {
    program,
    balance,
    pointsToRedeem: points,
    discountValue,
    remainingBalance: Number(balance.points_balance) - points,
  }
}

export async function redeemLoyaltyAtCheckout(
  client,
  { supplierId, restaurantId, orderId, pointsToRedeem, orderSubtotal, createdBy }
) {
  const preview = await validateLoyaltyRedeem({
    supplierId,
    restaurantId,
    pointsToRedeem,
    orderSubtotal,
  })

  const balance = await getOrCreateBalance(client, supplierId, restaurantId)
  if (preview.pointsToRedeem > Number(balance.points_balance)) {
    throw new ValidationError('Insufficient loyalty points')
  }

  const balanceAfter = Number(balance.points_balance) - preview.pointsToRedeem
  await client.query(
    `
    UPDATE restaurant_loyalty_balance
    SET points_balance = $1,
        lifetime_redeemed = lifetime_redeemed + $2,
        updated_at = NOW()
    WHERE supplier_id = $3 AND restaurant_id = $4
    `,
    [balanceAfter, preview.pointsToRedeem, supplierId, restaurantId]
  )

  const { rows: ledgerRows } = await client.query(
    `
    INSERT INTO loyalty_ledger (
      supplier_id, restaurant_id, order_id,
      entry_type, points_delta, balance_after,
      monetary_value, reference_id, reference_type, created_by
    )
    VALUES ($1, $2, $3, 'REDEEM', $4, $5, $6, $7, 'customer_order', $8)
    RETURNING *
    `,
    [
      supplierId,
      restaurantId,
      orderId,
      -preview.pointsToRedeem,
      balanceAfter,
      preview.discountValue,
      orderId,
      createdBy || null,
    ]
  )

  return {
    ...preview,
    ledgerEntry: ledgerRows[0],
    balanceAfter,
  }
}

export async function earnLoyaltyOnOrderReceive(
  client,
  { supplierId, restaurantId, orderId, receiveAmount, createdBy }
) {
  const spendAmount = Number(receiveAmount || 0)
  if (spendAmount <= 0) return null

  const { rows: programRows } = await client.query(
    `SELECT * FROM supplier_loyalty_program WHERE supplier_id = $1 AND enabled = TRUE`,
    [supplierId]
  )
  const program = mapSupplierProgramRow(programRows[0])
  if (!program) return null

  const pointsEarned = computeEarnPoints(program, spendAmount)
  if (pointsEarned <= 0) return null

  const { rows: existing } = await client.query(
    `
    SELECT id FROM loyalty_ledger
    WHERE supplier_id = $1 AND restaurant_id = $2 AND order_id = $3 AND entry_type = 'EARN'
    LIMIT 1
    `,
    [supplierId, restaurantId, orderId]
  )
  if (existing.length > 0) {
    logger.info('Loyalty earn skipped — already recorded for order', { orderId, supplierId })
    return null
  }

  const balance = await getOrCreateBalance(client, supplierId, restaurantId)
  const balanceAfter = Number(balance.points_balance) + pointsEarned

  await client.query(
    `
    UPDATE restaurant_loyalty_balance
    SET points_balance = $1,
        lifetime_earned = lifetime_earned + $2,
        updated_at = NOW()
    WHERE supplier_id = $3 AND restaurant_id = $4
    `,
    [balanceAfter, pointsEarned, supplierId, restaurantId]
  )

  const { rows: ledgerRows } = await client.query(
    `
    INSERT INTO loyalty_ledger (
      supplier_id, restaurant_id, order_id,
      entry_type, points_delta, balance_after,
      monetary_value, reference_id, reference_type, notes, created_by
    )
    VALUES ($1, $2, $3, 'EARN', $4, $5, $6, $7, 'receiving_report', $8, $9)
    RETURNING *
    `,
    [
      supplierId,
      restaurantId,
      orderId,
      pointsEarned,
      balanceAfter,
      spendAmount,
      orderId,
      `Earned on order receive`,
      createdBy || null,
    ]
  )

  return {
    pointsEarned,
    balanceAfter,
    ledgerEntry: ledgerRows[0],
  }
}

// ---------------------------------------------------------------------------
// D2: Consumer loyalty
// ---------------------------------------------------------------------------

export async function getConsumerLoyaltyProgram(restaurantId) {
  const { rows } = await query(`SELECT * FROM consumer_loyalty_program WHERE restaurant_id = $1`, [
    restaurantId,
  ])
  return mapConsumerProgramRow(rows[0])
}

export async function upsertConsumerLoyaltyProgram(restaurantId, payload) {
  const {
    name = 'Rewards',
    enabled = false,
    earnPointsPerCurrency = 1,
    redeemCurrencyPerPoint = 0.01,
    minRedeemPoints = 50,
    welcomeBonusPoints = 0,
    maxRedeemPercent = 50,
    rulesJson = { fulfillment_multipliers: DEFAULT_FULFILLMENT_MULTIPLIERS },
  } = payload

  const { rows } = await query(
    `
    INSERT INTO consumer_loyalty_program (
      restaurant_id, name, enabled,
      earn_points_per_currency, redeem_currency_per_point,
      min_redeem_points, welcome_bonus_points, max_redeem_percent, rules_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    ON CONFLICT (restaurant_id) DO UPDATE SET
      name = EXCLUDED.name,
      enabled = EXCLUDED.enabled,
      earn_points_per_currency = EXCLUDED.earn_points_per_currency,
      redeem_currency_per_point = EXCLUDED.redeem_currency_per_point,
      min_redeem_points = EXCLUDED.min_redeem_points,
      welcome_bonus_points = EXCLUDED.welcome_bonus_points,
      max_redeem_percent = EXCLUDED.max_redeem_percent,
      rules_json = EXCLUDED.rules_json,
      updated_at = NOW()
    RETURNING *
    `,
    [
      restaurantId,
      name,
      enabled,
      earnPointsPerCurrency,
      redeemCurrencyPerPoint,
      minRedeemPoints,
      welcomeBonusPoints,
      maxRedeemPercent,
      JSON.stringify(rulesJson),
    ]
  )
  return mapConsumerProgramRow(rows[0])
}

export async function getConsumerMemberBalance(restaurantId, memberId) {
  const { rows: memberRows } = await query(
    `
    SELECT * FROM consumer_member
    WHERE id = $1 AND restaurant_id = $2
    `,
    [memberId, restaurantId]
  )
  if (!memberRows.length) {
    throw new NotFoundError('Consumer member not found')
  }

  const program = await getConsumerLoyaltyProgram(restaurantId)
  const { rows: ledgerRows } = await query(
    `
    SELECT * FROM consumer_loyalty_ledger
    WHERE consumer_member_id = $1
    ORDER BY created_at DESC
    LIMIT 20
    `,
    [memberId]
  )

  return {
    program,
    member: memberRows[0],
    recentLedger: ledgerRows,
  }
}

export async function earnConsumerLoyaltyOnOrderComplete(
  client,
  { restaurantId, memberId, consumerOrderId, spendAmount, fulfillmentType }
) {
  const spend = Number(spendAmount || 0)
  if (spend <= 0 || !memberId) return null

  const db = client || { query: (...args) => query(...args) }

  const { rows: programRows } = await db.query(
    `SELECT * FROM consumer_loyalty_program WHERE restaurant_id = $1 AND enabled = TRUE`,
    [restaurantId]
  )
  const program = mapConsumerProgramRow(programRows[0])
  if (!program) return null

  const pointsEarned = computeEarnPoints(program, spend, { fulfillmentType })
  if (pointsEarned <= 0) return null

  const { rows: existing } = await db.query(
    `
    SELECT id FROM consumer_loyalty_ledger
    WHERE restaurant_id = $1 AND consumer_member_id = $2
      AND consumer_order_id = $3 AND entry_type = 'EARN'
    LIMIT 1
    `,
    [restaurantId, memberId, consumerOrderId]
  )
  if (existing.length > 0) return null

  const { rows: memberRows } = await db.query(
    `SELECT * FROM consumer_member WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
    [memberId, restaurantId]
  )
  if (!memberRows.length) return null

  const member = memberRows[0]
  const balanceAfter = Number(member.loyalty_points) + pointsEarned

  await db.query(
    `
    UPDATE consumer_member
    SET loyalty_points = $1,
        lifetime_earned = lifetime_earned + $2,
        updated_at = NOW()
    WHERE id = $3
    `,
    [balanceAfter, pointsEarned, memberId]
  )

  const { rows: ledgerRows } = await db.query(
    `
    INSERT INTO consumer_loyalty_ledger (
      restaurant_id, consumer_member_id, consumer_order_id,
      entry_type, points_delta, balance_after, fulfillment_type
    )
    VALUES ($1, $2, $3, 'EARN', $4, $5, $6)
    RETURNING *
    `,
    [restaurantId, memberId, consumerOrderId, pointsEarned, balanceAfter, fulfillmentType || null]
  )

  return {
    pointsEarned,
    balanceAfter,
    ledgerEntry: ledgerRows[0],
  }
}

export async function validateConsumerLoyaltyRedeem({
  restaurantId,
  memberId,
  pointsToRedeem,
  orderSubtotal,
}) {
  const points = Number(pointsToRedeem)
  if (!Number.isInteger(points) || points <= 0) {
    throw new ValidationError('Points to redeem must be a positive integer')
  }

  const program = await getConsumerLoyaltyProgram(restaurantId)
  if (!program?.enabled) {
    throw new ValidationError('Rewards program is not enabled')
  }

  if (points < program.min_redeem_points) {
    throw new ValidationError(`Minimum redeem is ${program.min_redeem_points} points`)
  }

  const { rows: memberRows } = await query(
    `SELECT loyalty_points FROM consumer_member WHERE id = $1 AND restaurant_id = $2`,
    [memberId, restaurantId]
  )
  if (!memberRows.length) {
    throw new NotFoundError('Consumer member not found')
  }

  const memberBalance = Number(memberRows[0].loyalty_points || 0)
  if (points > memberBalance) {
    throw new ValidationError('Insufficient loyalty points')
  }

  const discountValue = roundMoney(computeRedeemValue(program, points))
  const subtotal = Number(orderSubtotal || 0)
  const maxByPercent = subtotal * (Number(program.max_redeem_percent) / 100)
  if (subtotal > 0 && discountValue > maxByPercent) {
    throw new ValidationError(
      `Redemption exceeds maximum ${program.max_redeem_percent}% of order subtotal`
    )
  }

  return {
    program,
    memberBalance,
    pointsToRedeem: points,
    discountValue,
    remainingBalance: memberBalance - points,
  }
}

export async function redeemConsumerLoyaltyAtCheckout(
  client,
  { restaurantId, memberId, consumerOrderId, pointsToRedeem, orderSubtotal }
) {
  const preview = await validateConsumerLoyaltyRedeem({
    restaurantId,
    memberId,
    pointsToRedeem,
    orderSubtotal,
  })

  const { rows: memberRows } = await client.query(
    `SELECT * FROM consumer_member WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
    [memberId, restaurantId]
  )
  if (!memberRows.length) {
    throw new NotFoundError('Consumer member not found')
  }

  const member = memberRows[0]
  if (preview.pointsToRedeem > Number(member.loyalty_points)) {
    throw new ValidationError('Insufficient loyalty points')
  }

  const balanceAfter = Number(member.loyalty_points) - preview.pointsToRedeem
  await client.query(
    `
    UPDATE consumer_member
    SET loyalty_points = $1,
        lifetime_redeemed = lifetime_redeemed + $2,
        updated_at = NOW()
    WHERE id = $3
    `,
    [balanceAfter, preview.pointsToRedeem, memberId]
  )

  const { rows: ledgerRows } = await client.query(
    `
    INSERT INTO consumer_loyalty_ledger (
      restaurant_id, consumer_member_id, consumer_order_id,
      entry_type, points_delta, balance_after, metadata
    )
    VALUES ($1, $2, $3, 'REDEEM', $4, $5, $6::jsonb)
    RETURNING *
    `,
    [
      restaurantId,
      memberId,
      consumerOrderId,
      -preview.pointsToRedeem,
      balanceAfter,
      JSON.stringify({ discountValue: preview.discountValue }),
    ]
  )

  return {
    ...preview,
    ledgerEntry: ledgerRows[0],
    balanceAfter,
  }
}

export async function getConsumerLoyaltyPreview({
  restaurantId,
  memberId,
  orderSubtotal,
  fulfillmentType,
  pointsToRedeem,
}) {
  const program = await getConsumerLoyaltyProgram(restaurantId)
  let memberBalance = 0
  if (memberId) {
    const { rows } = await query(
      `SELECT loyalty_points FROM consumer_member WHERE id = $1 AND restaurant_id = $2`,
      [memberId, restaurantId]
    )
    memberBalance = Number(rows[0]?.loyalty_points ?? 0)
  }

  const subtotal = Number(orderSubtotal || 0)
  const earnPoints =
    memberId && program?.enabled ? computeEarnPoints(program, subtotal, { fulfillmentType }) : 0

  const preview = {
    programEnabled: Boolean(program?.enabled),
    programName: program?.name ?? 'Rewards',
    memberBalance,
    earnPoints,
    minRedeemPoints: program?.min_redeem_points ?? 0,
    redeemCurrencyPerPoint: program?.redeem_currency_per_point ?? 0,
    maxRedeemPercent: program?.max_redeem_percent ?? 50,
    welcomeBonusPoints: program?.welcome_bonus_points ?? 0,
    redeem: null,
    suggestedRedeemPoints: null,
    suggestedDiscount: null,
  }

  if (pointsToRedeem && memberId) {
    try {
      preview.redeem = await validateConsumerLoyaltyRedeem({
        restaurantId,
        memberId,
        pointsToRedeem,
        orderSubtotal: subtotal,
      })
    } catch (err) {
      preview.redeem = { error: err.message }
    }
  } else if (
    memberId &&
    program?.enabled &&
    memberBalance >= (program.min_redeem_points ?? 0) &&
    subtotal > 0
  ) {
    const rate = Number(program.redeem_currency_per_point) || 0.01
    const maxDiscount = subtotal * (Number(program.max_redeem_percent ?? 50) / 100)
    const maxByValue = Math.floor(maxDiscount / rate)
    const suggestedPoints = Math.min(memberBalance, maxByValue)
    if (suggestedPoints >= program.min_redeem_points) {
      preview.suggestedRedeemPoints = suggestedPoints
      preview.suggestedDiscount = roundMoney(computeRedeemValue(program, suggestedPoints))
    }
  }

  return preview
}
