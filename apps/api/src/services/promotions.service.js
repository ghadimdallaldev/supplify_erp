import { query } from '../lib/db.js'

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
  if (!promotion || promotion.status !== 'active') return false
  const ts = now instanceof Date ? now : new Date(now)
  if (promotion.starts_at && new Date(promotion.starts_at) > ts) return false
  if (promotion.ends_at && new Date(promotion.ends_at) <= ts) return false
  if (
    promotion.usage_limit != null &&
    Number(promotion.usage_count) >= Number(promotion.usage_limit)
  ) {
    return false
  }
  if (promotion.restaurant_ids?.length) {
    if (!restaurantId || !promotion.restaurant_ids.includes(restaurantId)) return false
  }
  return true
}

/**
 * Line items subset that counts toward promotion (product/category targets).
 */
export function filterEligibleLineItems(promotion, lineItems) {
  if (!lineItems?.length) return []
  if (promotion.applies_to === 'all') return lineItems

  const productIds = new Set((promotion.target_product_ids || []).map(String))
  const categoryIds = new Set((promotion.target_category_ids || []).map(String))

  return lineItems.filter((line) => {
    if (promotion.applies_to === 'specific_products') {
      return productIds.has(String(line.productId || line.product_id))
    }
    if (promotion.applies_to === 'specific_categories') {
      const catId = line.categoryId || line.category_id
      return catId && categoryIds.has(String(catId))
    }
    return true
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
  const { rows } = await db.query(
    `
    SELECT p.*,
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
        (SELECT array_agg(prt.restaurant_id) FROM promotion_restaurant_targets prt
         WHERE prt.promotion_id = p.id),
        '{}'
      ) AS restaurant_ids
    FROM promotions p
    WHERE p.supplier_id = $1
      AND p.status = 'active'
      AND p.starts_at <= NOW()
      AND (p.ends_at IS NULL OR p.ends_at > NOW())
      AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
      AND (
        NOT EXISTS (SELECT 1 FROM promotion_restaurant_targets prt WHERE prt.promotion_id = p.id)
        OR EXISTS (
          SELECT 1 FROM promotion_restaurant_targets prt
          WHERE prt.promotion_id = p.id AND prt.restaurant_id = $2
        )
      )
    ORDER BY p.is_featured DESC, p.starts_at DESC
    `,
    [supplierId, restaurantId]
  )
  return rows
}

export async function loadActivePromotionsForSupplier(supplierId, restaurantId) {
  return fetchActivePromotionsForSupplier(query, supplierId, restaurantId)
}

/**
 * Apply best eligible promotion inside an order transaction.
 */
export async function applyBestPromotionToOrder({
  client,
  orderId,
  supplierId,
  restaurantId,
  subtotal,
  lineItems,
}) {
  const { canApplyDealRedemption } = await import('../lib/subscription.js')
  const redemption = await canApplyDealRedemption(restaurantId)
  if (!redemption.allowed) return null

  const promotions = await fetchActivePromotionsForSupplier(client, supplierId, restaurantId)
  const selected = selectBestPromotion(promotions, subtotal, lineItems, { restaurantId })
  if (!selected || selected.discountAmount <= 0) return null

  const { promotion, discountAmount } = selected
  const newTotal = Math.max(0, Number(subtotal) - discountAmount)

  await client.query(
    `UPDATE customer_order SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
    [newTotal, orderId]
  )

  await client.query(
    `
    INSERT INTO promotion_usages (promotion_id, order_id, restaurant_id, discount_applied)
    VALUES ($1, $2, $3, $4)
    `,
    [promotion.id, orderId, restaurantId, discountAmount]
  )

  await client.query(
    `UPDATE promotions SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`,
    [promotion.id]
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
  const { rows } = await query(
    `
    UPDATE promotions
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active'
      AND ends_at IS NOT NULL
      AND ends_at < NOW()
    RETURNING id
    `
  )
  return { expiredCount: rows.length, ids: rows.map((r) => r.id) }
}
