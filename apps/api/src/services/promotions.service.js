import { query } from '../lib/db.js'
import { isRestaurantVisibleDeal, buildDealConfigSnapshot } from './deal-lifecycle.service.js'
import { isFeatureEnabled } from '../lib/subscription.js'
import { moneySub, moneyToNumber } from '../lib/money.js'
import { ConflictError } from '../middlewares/errorHandler.js'
import { leafCategoryIdSql, productShelfIdsSql } from '../lib/category-sql.js'

function runQuery(db, text, params) {
  if (db && typeof db.query === 'function') {
    return db.query(text, params)
  }
  if (typeof db === 'function') {
    return db(text, params)
  }
  throw new Error('Invalid database handle')
}

const ORDER_DISCOUNT_TYPES = new Set([
  'percentage_discount',
  'fixed_discount',
  'free_shipping',
  'buy_x_get_y',
])

/**
 * Whether a promotion is within its active window and not over usage limit.
 */
export function isPromotionEligible(promotion, { now = new Date(), restaurantId } = {}) {
  if (!isRestaurantVisibleDeal(promotion, { now, restaurantId })) return false
  return true
}

/**
 * `target_product_ids`, `target_category_ids` and `target_shelf_ids` for promotion alias `p`.
 * Every loader that feeds calculatePromotionDiscount must select these.
 */
export const PROMOTION_TARGET_ARRAYS_SQL = `
      COALESCE(
        (SELECT array_agg(pt.product_id) FILTER (WHERE pt.product_id IS NOT NULL)
         FROM promotion_targets pt WHERE pt.promotion_id = p.id),
        '{}'
      ) AS target_product_ids,
      COALESCE(
        (SELECT array_agg(pt.category_id) FILTER (WHERE pt.category_id IS NOT NULL)
         FROM promotion_targets pt WHERE pt.promotion_id = p.id),
        '{}'
      ) AS target_category_ids,
      COALESCE(
        (SELECT array_agg(pt.shelf_id) FILTER (WHERE pt.shelf_id IS NOT NULL)
         FROM promotion_targets pt WHERE pt.promotion_id = p.id),
        '{}'
      ) AS target_shelf_ids`

/**
 * Line items that count toward a promotion. A targeted deal (any `applies_to` other than
 * `all`) covers a line when ANY of its targets matches: the product itself, the line's leaf
 * platform category, or one of the product's shelves. Each line is kept at most once, so a
 * product matched by several targets is discounted once (spec §11.5).
 * Lines must carry server-resolved `categoryId` (leaf) and `shelfIds`; see
 * hydratePromotionLineItems.
 */
export function filterEligibleLineItems(promotion, lineItems) {
  if (!lineItems?.length) return []
  if (promotion.applies_to === 'all') return lineItems

  const productIds = new Set((promotion.target_product_ids || []).map(String))
  const categoryIds = new Set((promotion.target_category_ids || []).map(String))
  const shelfIds = new Set((promotion.target_shelf_ids || []).map(String))

  return lineItems.filter((line) => {
    const productId = line.productId || line.product_id
    if (productId && productIds.has(String(productId))) return true
    const categoryId = line.categoryId || line.category_id
    if (categoryId && categoryIds.has(String(categoryId))) return true
    const lineShelves = line.shelfIds || line.shelf_ids || []
    return lineShelves.some((id) => shelfIds.has(String(id)))
  })
}

/**
 * Predicate: promotion `promoAlias` covers product `productAlias` — same supplier, and either a
 * supplier-wide deal or one of its targets matches the product, its leaf platform category or
 * one of its non-archived shelves. EXISTS keeps one row per product (discounted once).
 * Aliases are trusted identifiers, never input.
 */
export function dealCoversProductSql(promoAlias = 'p', productAlias = 'pr') {
  return `(${productAlias}.supplier_id = ${promoAlias}.supplier_id AND (
    ${promoAlias}.applies_to = 'all' OR EXISTS (
      SELECT 1 FROM promotion_targets dpt
      WHERE dpt.promotion_id = ${promoAlias}.id AND (
        dpt.product_id = ${productAlias}.id
        OR dpt.category_id = ${leafCategoryIdSql(productAlias)}
        OR (dpt.shelf_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM product_shelf dps
          JOIN supplier_shelf dsh ON dsh.id = dps.shelf_id AND dsh.archived_at IS NULL
          WHERE dps.shelf_id = dpt.shelf_id AND dps.product_id = ${productAlias}.id))
      ))))`
}

/**
 * Replace client-sent category/shelf data on cart lines with the product's own leaf category
 * and shelves. Lines whose product is not this supplier's lose both, so a deal can never
 * cover another supplier's product.
 * @param {{ query: Function } | Function} db
 */
export async function hydratePromotionLineItems(db, supplierId, lineItems = []) {
  const ids = [...new Set(lineItems.map((l) => l.productId || l.product_id).filter(Boolean))]
  const byId = new Map()
  if (ids.length) {
    const { rows } = await runQuery(
      db,
      `SELECT p.id, ${leafCategoryIdSql('p')} AS category_id, ${productShelfIdsSql('p')} AS shelf_ids
       FROM product p WHERE p.id = ANY($1::uuid[]) AND p.supplier_id = $2`,
      [ids, supplierId]
    )
    for (const row of rows) byId.set(row.id, row)
  }
  return lineItems.map((line) => {
    const own = byId.get(line.productId || line.product_id)
    return { ...line, categoryId: own?.category_id ?? null, shelfIds: own?.shelf_ids ?? [] }
  })
}

/**
 * Compute discount amount for a promotion against subtotal and line items.
 */
export function calculatePromotionDiscount(promotion, subtotal, lineItems = []) {
  const total = Number(subtotal) || 0
  if (total <= 0 || !ORDER_DISCOUNT_TYPES.has(promotion.type)) return 0

  const minOrder = promotion.min_order_amount == null ? null : Number(promotion.min_order_amount)
  if (minOrder != null && total < minOrder) return 0

  const eligibleLines = filterEligibleLineItems(promotion, lineItems)
  const eligibleSubtotal = eligibleLines.reduce(
    (sum, line) => sum + Number(line.lineTotal ?? line.line_total ?? 0),
    0
  )
  const basis = promotion.applies_to === 'all' ? total : eligibleSubtotal
  if (basis <= 0) return 0

  let discount = 0
  const value = Number(promotion.discount_value) || 0

  switch (promotion.type) {
    case 'percentage_discount':
      discount = (basis * value) / 100
      break
    case 'fixed_discount':
      discount = Math.min(value, basis)
      break
    case 'free_shipping':
      discount = Math.min(value > 0 ? value : 0, basis)
      break
    case 'buy_x_get_y': {
      const buyQty = Number(promotion.buy_quantity) || 0
      const getQty = Number(promotion.get_quantity) || 0
      if (buyQty <= 0 || getQty <= 0) break
      const units = eligibleLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
      const sets = Math.floor(units / buyQty)
      if (sets <= 0) break
      const unitPrices = eligibleLines
        .map((line) => Number(line.unitPrice ?? line.unit_price ?? 0))
        .filter((p) => p > 0)
        .sort((a, b) => a - b)
      const cheapest = unitPrices[0] || 0
      discount = sets * getQty * cheapest
      break
    }
    default:
      discount = 0
  }

  if (promotion.max_discount_cap != null) {
    discount = Math.min(discount, Number(promotion.max_discount_cap))
  }
  return Math.round(Math.max(0, Math.min(discount, total)) * 100) / 100
}

/**
 * Pick the promotion that yields the highest discount.
 */
export function selectBestPromotion(promotions, subtotal, lineItems, context = {}) {
  let best = null
  let bestDiscount = 0
  for (const promo of promotions || []) {
    if (!isPromotionEligible(promo, context)) continue
    if (promo.type === 'featured_listing') continue
    const amount = calculatePromotionDiscount(promo, subtotal, lineItems)
    if (amount > bestDiscount) {
      bestDiscount = amount
      best = promo
    }
  }
  return best ? { promotion: best, discountAmount: bestDiscount } : null
}

/**
 * Load active promotions for a supplier visible to a restaurant.
 */
async function fetchActivePromotionsForSupplier(db, supplierId, restaurantId) {
  const { rows } = await runQuery(
    db,
    `
    SELECT p.*,
      ${PROMOTION_TARGET_ARRAYS_SQL}
    FROM promotions p
    WHERE p.supplier_id = $1
      AND p.status = 'active'
      AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
      AND p.starts_at <= NOW()
      AND (p.ends_at IS NULL OR p.ends_at > NOW())
      AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
    ORDER BY p.is_featured DESC, p.starts_at DESC
    `,
    [supplierId]
  )
  return rows
}

const ACTIVE_ORDER_PROMO_EXISTS_SQL = `
  SELECT 1
  FROM promotions p
  WHERE p.supplier_id = $1
    AND p.status = 'active'
    AND p.type <> 'featured_listing'
    AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
    AND p.starts_at <= NOW()
    AND (p.ends_at IS NULL OR p.ends_at > NOW())
    AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
  LIMIT 1
`

/** Fast EXISTS check — skip heavy promotion scan when supplier has no eligible deals. */
export async function hasActiveSupplierOrderPromotions(db, supplierId, restaurantId) {
  const { rows } = await runQuery(db, ACTIVE_ORDER_PROMO_EXISTS_SQL, [supplierId])
  return rows.length > 0
}

const ACTIVE_ORDER_PROMO_BATCH_SQL = `
  SELECT DISTINCT p.supplier_id
  FROM promotions p
  WHERE p.supplier_id = ANY($1::uuid[])
    AND p.status = 'active'
    AND p.type <> 'featured_listing'
    AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
    AND p.starts_at <= NOW()
    AND (p.ends_at IS NULL OR p.ends_at > NOW())
    AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
`

/**
 * Batch promo preflight for multi-supplier carts (one query instead of N EXISTS checks).
 * @returns {Map<string, boolean>}
 */
export async function hasActiveSupplierOrderPromotionsBatch(db, supplierIds, restaurantId) {
  const uniqueIds = [...new Set(supplierIds.filter(Boolean))]
  const result = new Map(uniqueIds.map((id) => [id, false]))
  if (!uniqueIds.length) return result

  const { rows } = await runQuery(db, ACTIVE_ORDER_PROMO_BATCH_SQL, [uniqueIds])
  for (const row of rows) {
    result.set(row.supplier_id, true)
  }
  return result
}

export async function loadActivePromotionsForSupplier(supplierId, restaurantId) {
  return fetchActivePromotionsForSupplier(query, supplierId, restaurantId)
}

/**
 * Order total after a discount. The discount is computed on the promo-eligible lines, but
 * the total starts from the full order subtotal (QUOTE_PRICE lines are excluded from the
 * discount, not from the order).
 */
export function totalAfterPromotionDiscount(orderSubtotal, discountAmount) {
  return Math.max(0, moneyToNumber(moneySub(orderSubtotal, discountAmount)))
}

export const PROMOTION_NO_LONGER_AVAILABLE = 'PROMOTION_NO_LONGER_AVAILABLE'

/**
 * 409 raised inside the order transaction when a promotion that qualified for the order
 * lost the atomic usage claim (another checkout took the last redemption). Throwing rolls
 * the whole order back instead of silently placing it without the discount.
 */
export function promotionNoLongerAvailableError(promotionName) {
  const label = promotionName ? `"${promotionName}"` : 'you selected'
  const err = new ConflictError(
    `The promotion ${label} just reached its redemption limit and is no longer available. ` +
      'Remove it or review your cart and place the order again.',
    { promotionName: promotionName || null }
  )
  err.code = PROMOTION_NO_LONGER_AVAILABLE
  return err
}

/**
 * Atomically consume one redemption. The caps are checked inside the UPDATE so two
 * concurrent orders cannot both pass an unlocked `usage_count < usage_limit` read.
 * stock_quantity is the deal's redemption stock and is compared with the same counter.
 * @returns {Promise<boolean>} false when the promotion is exhausted (nothing was written)
 */
export async function claimPromotionUsage(db, promotionId) {
  const { rows } = await runQuery(
    db,
    `
    UPDATE promotions
    SET usage_count = usage_count + 1, updated_at = NOW()
    WHERE id = $1
      AND (usage_limit IS NULL OR usage_count < usage_limit)
      AND (stock_quantity IS NULL OR usage_count < stock_quantity)
    RETURNING id, usage_count
    `,
    [promotionId]
  )
  return rows.length > 0
}

/**
 * Give promotion redemptions back when an order is cancelled: usage_count drops by the
 * number of redemptions the order consumed (never below 0). Each promotion_usages row is
 * marked released in the same statement that selects it, so a repeated cancel (or a
 * concurrent one) cannot decrement twice. The usage row itself is kept for audit.
 * @returns {Promise<{ released: number }>}
 */
export async function releasePromotionUsageForOrder(db, orderId) {
  const { rows } = await runQuery(
    db,
    `
    UPDATE promotion_usages
    SET released_at = NOW()
    WHERE order_id = $1 AND released_at IS NULL
    RETURNING promotion_id
    `,
    [orderId]
  )
  if (!rows.length) return { released: 0 }

  const byPromotion = new Map()
  for (const row of rows) {
    if (!row.promotion_id) continue
    byPromotion.set(row.promotion_id, (byPromotion.get(row.promotion_id) || 0) + 1)
  }
  for (const [promotionId, count] of byPromotion) {
    await runQuery(
      db,
      `UPDATE promotions
       SET usage_count = GREATEST(0, usage_count - $2), updated_at = NOW()
       WHERE id = $1`,
      [promotionId, count]
    )
  }
  return { released: rows.length }
}

/**
 * Apply best eligible promotion inside an order transaction.
 * `subtotal` is the promo-eligible subtotal (discount base); `orderSubtotal` is the full
 * order subtotal the total is derived from (defaults to `subtotal`).
 */
export async function applyBestPromotionToOrder({
  client,
  orderId,
  supplierId,
  restaurantId,
  subtotal,
  orderSubtotal = subtotal,
  lineItems,
  skipDealPreflight = false,
}) {
  if (!skipDealPreflight) {
    const dealsEnabled = await isFeatureEnabled(restaurantId, 'RESTAURANT', 'supplier_deals')
    const redeemEnabled = await isFeatureEnabled(
      restaurantId,
      'RESTAURANT',
      'supplier_deals_redeem'
    )
    if (!dealsEnabled || !redeemEnabled) return null

    const hasDeals = await hasActiveSupplierOrderPromotions(client, supplierId, restaurantId)
    if (!hasDeals) return null
  }

  const promotions = await fetchActivePromotionsForSupplier(client, supplierId, restaurantId)
  const selected = selectBestPromotion(promotions, subtotal, lineItems, { restaurantId })
  if (!selected || selected.discountAmount <= 0) return null

  const { promotion, discountAmount } = selected
  // Claim first: if another order took the last redemption, reject the order (rolls back).
  if (!(await claimPromotionUsage(client, promotion.id))) {
    throw promotionNoLongerAvailableError(promotion.name)
  }

  const newTotal = totalAfterPromotionDiscount(orderSubtotal, discountAmount)

  await client.query(
    `UPDATE customer_order SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
    [newTotal, orderId]
  )

  await client.query(
    `
    INSERT INTO promotion_usages (
      promotion_id, order_id, restaurant_id, discount_applied,
      deal_title, deal_type, supplier_id, discount_type, discount_value,
      delivery_discount_applied, deal_config_snapshot, applied_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    `,
    [
      promotion.id,
      orderId,
      restaurantId,
      discountAmount,
      promotion.name,
      promotion.type,
      supplierId,
      promotion.type,
      promotion.discount_value,
      promotion.type === 'free_shipping' ? discountAmount : 0,
      JSON.stringify(buildDealConfigSnapshot(promotion)),
    ]
  )

  return {
    promotionId: promotion.id,
    promotionName: promotion.name,
    promotionType: promotion.type,
    discountAmount,
    totalAfterDiscount: newTotal,
  }
}

export async function deactivateExpiredPromotions() {
  const { rows: scheduled } = await query(
    `
    UPDATE promotions
    SET status = 'active', updated_at = NOW()
    WHERE status = 'scheduled'
      AND starts_at <= NOW()
      AND COALESCE(payment_status, 'not_required') IN ('not_required', 'paid')
      AND EXISTS (
        SELECT 1
        FROM subscription sub
        WHERE sub.tenant_id = promotions.supplier_id
          AND sub.tenant_type = 'SUPPLIER'
          AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
          AND sub.account_locked_at IS NULL
      )
    RETURNING id
    `
  )

  const { rows: boostExpired } = await query(
    `
    UPDATE promotions
    SET status = 'expired', updated_at = NOW()
    WHERE status IN ('active', 'scheduled')
      AND boost_end_at IS NOT NULL
      AND boost_end_at < NOW()
    RETURNING id
    `
  )

  const { rows } = await query(
    `
    UPDATE promotions
    SET status = 'expired', updated_at = NOW()
    WHERE status IN ('active', 'scheduled')
      AND ends_at IS NOT NULL
      AND ends_at < NOW()
    RETURNING id
    `
  )

  const expiredIds = new Set([...boostExpired.map((r) => r.id), ...rows.map((r) => r.id)])
  return {
    expiredCount: expiredIds.size,
    activatedCount: scheduled.length,
    ids: [...expiredIds],
  }
}
