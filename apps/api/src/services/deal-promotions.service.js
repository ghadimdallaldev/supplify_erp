import { query, withTransaction } from '../lib/db.js'
import { buildBoostStatus } from './deal-boost.helpers.js'
import { calculatePromotionDiscount, isPromotionEligible } from './promotions.service.js'
import {
  buildDealConfigSnapshot,
  EXTENDED_INTERACTION_TYPES,
  isRestaurantVisibleDeal,
  getDealDiscountDisplayLabel,
  getRestaurantIneligibilityMessage,
  getDealTypeLabel,
} from './deal-lifecycle.service.js'

const INTERACTION_TYPES = EXTENDED_INTERACTION_TYPES

export function matchesRestaurantTargeting(deal, restaurant) {
  let types = deal.target_restaurant_types || []
  if (typeof types === 'string') {
    try {
      types = JSON.parse(types)
    } catch {
      types = []
    }
  }
  if (Array.isArray(types) && types.length > 0) {
    const biz = (restaurant?.business_type || '').toLowerCase()
    if (!types.some((t) => String(t).toLowerCase() === biz)) return false
  }
  let areas = deal.target_areas || []
  if (typeof areas === 'string') {
    try {
      areas = JSON.parse(areas)
    } catch {
      areas = []
    }
  }
  if (Array.isArray(areas) && areas.length > 0) {
    const loc = [restaurant?.city, restaurant?.state, restaurant?.country, restaurant?.address]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!areas.some((a) => loc.includes(String(a).toLowerCase()))) return false
  }
  return true
}

export function matchesPromotionAudience(audience, restaurant) {
  if (!audience || audience.all === true) return true
  const types = audience.restaurantTypes || audience.restaurant_types || []
  if (types.length > 0) {
    const biz = (restaurant?.business_type || '').toLowerCase()
    if (!types.some((t) => String(t).toLowerCase() === biz)) return false
  }
  const areas = audience.areas || []
  if (areas.length > 0) {
    const loc = [restaurant?.city, restaurant?.state, restaurant?.country, restaurant?.address]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!areas.some((a) => loc.includes(String(a).toLowerCase()))) return false
  }
  return true
}

/**
 * Load restaurant row for targeting checks.
 */
export async function loadRestaurantForTargeting(restaurantId) {
  const { rows } = await query(
    `SELECT id, name, business_type, address_json FROM restaurant WHERE id = $1`,
    [restaurantId]
  )
  const r = rows[0]
  if (!r) return null
  const addr = r.address_json || {}
  return {
    ...r,
    city: addr.city,
    state: addr.state,
    country: addr.country,
    address: addr.line1 || addr.street,
  }
}

/**
 * Latest boost campaign row for a deal (active, scheduled, or most recent).
 */
export async function getLatestDealPromotion(db, dealId) {
  const { rows } = await db.query(
    `
    SELECT * FROM deal_promotions
    WHERE deal_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [dealId]
  )
  return rows[0] || null
}

/**
 * Whether a deal is currently boosted (paid promotion active).
 */
export async function getActiveDealPromotion(db, dealId) {
  const { rows } = await db.query(
    `
    SELECT * FROM deal_promotions
    WHERE deal_id = $1
      AND status = 'active'
      AND starts_at <= NOW()
      AND (ends_at IS NULL OR ends_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [dealId]
  )
  return rows[0] || null
}

export async function getDealBoostStatusForSupplier(db, dealId) {
  const latest = await getLatestDealPromotion(db, dealId)
  if (!latest) return buildBoostStatus(null)

  const active = await getActiveDealPromotion(db, dealId)
  const promo = active || latest

  let pricingRow = null
  if (promo.pricing_key) {
    const { rows } = await db.query(
      `SELECT * FROM promotion_pricing_config WHERE pricing_key = $1`,
      [promo.pricing_key]
    )
    pricingRow = rows[0] || null
  }

  return buildBoostStatus(promo, pricingRow)
}

/**
 * Record interaction and bump promotion counters when applicable.
 */
export async function recordDealInteraction({
  dealId,
  restaurantId,
  supplierId,
  interactionType,
  metadata = {},
  dealPromotionId = null,
}) {
  if (!INTERACTION_TYPES.has(interactionType)) {
    throw new Error(`Invalid interaction type: ${interactionType}`)
  }

  const { rows } = await query(
    `
    INSERT INTO deal_interactions (
      deal_id, deal_promotion_id, restaurant_id, supplier_id, interaction_type, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [dealId, dealPromotionId, restaurantId, supplierId, interactionType, JSON.stringify(metadata)]
  )

  if (interactionType === 'view' && restaurantId) {
    await query(
      `
      INSERT INTO deal_restaurant_views (deal_id, restaurant_id, first_viewed_at, last_viewed_at, view_count)
      VALUES ($1, $2, NOW(), NOW(), 1)
      ON CONFLICT (deal_id, restaurant_id) DO UPDATE SET
        last_viewed_at = NOW(),
        view_count = deal_restaurant_views.view_count + 1
      `,
      [dealId, restaurantId]
    )
  }

  if (dealPromotionId) {
    const counterMap = {
      view: 'impressions',
      click: 'clicks',
      order: 'orders_count',
      message: 'messages_count',
      coupon_used: 'coupon_uses',
    }
    const col = counterMap[interactionType]
    if (col) {
      await query(
        `UPDATE deal_promotions SET ${col} = ${col} + 1, updated_at = NOW() WHERE id = $1`,
        [dealPromotionId]
      )
    }
  }

  return rows[0]
}

/**
 * Discoverable deals for a restaurant with filters and sponsored flag.
 */
export async function discoverDealsForRestaurant(restaurantId, options = {}) {
  const restaurant = await loadRestaurantForTargeting(restaurantId)
  if (!restaurant) return []

  const {
    supplierId,
    categoryId,
    sort = 'newest',
    expiringSoon = false,
    previewSupplierId = null,
  } = options

  const params = [restaurantId]
  let sql = `
    SELECT
      p.*,
      s.name AS supplier_name,
      s.slug AS supplier_slug,
      EXISTS (
        SELECT 1 FROM supplier_follow sf
        WHERE sf.supplier_id = p.supplier_id AND sf.restaurant_id = $1
      ) AS is_followed,
      dp.id AS deal_promotion_id,
      dp.budget AS promotion_budget,
      dp.starts_at AS promotion_starts_at,
      dp.ends_at AS promotion_ends_at,
      dp.target_audience AS promotion_target_audience,
      (dp.id IS NOT NULL) AS is_sponsored
    FROM promotions p
    JOIN supplier s ON s.id = p.supplier_id
    LEFT JOIN LATERAL (
      SELECT dp2.*
      FROM deal_promotions dp2
      WHERE dp2.deal_id = p.id
        AND dp2.status = 'active'
        AND dp2.starts_at <= NOW()
        AND (dp2.ends_at IS NULL OR dp2.ends_at > NOW())
      ORDER BY dp2.created_at DESC
      LIMIT 1
    ) dp ON TRUE
    WHERE p.status = 'active'
      AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
      AND p.boost_start_at IS NOT NULL
      AND p.boost_start_at <= NOW()
      AND p.boost_end_at IS NOT NULL
      AND p.boost_end_at > NOW()
      AND p.starts_at <= NOW()
      AND (p.ends_at IS NULL OR p.ends_at > NOW())
      AND (p.stock_quantity IS NULL OR p.usage_count < p.stock_quantity)
      AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
      AND (
        NOT EXISTS (SELECT 1 FROM promotion_restaurant_targets prt WHERE prt.promotion_id = p.id)
        OR EXISTS (
          SELECT 1 FROM promotion_restaurant_targets prt
          WHERE prt.promotion_id = p.id AND prt.restaurant_id = $1
        )
      )
      AND dp.id IS NOT NULL
  `

  if (previewSupplierId) {
    params.push(previewSupplierId)
    sql += ` AND p.supplier_id = $${params.length}`
  }

  if (supplierId) {
    params.push(supplierId)
    sql += ` AND p.supplier_id = $${params.length}`
  }

  if (categoryId) {
    params.push(categoryId)
    sql += ` AND (
      p.applies_to = 'all'
      OR EXISTS (
        SELECT 1 FROM promotion_targets pt
        WHERE pt.promotion_id = p.id AND pt.category_id = $${params.length}
      )
    )`
  }

  if (expiringSoon) {
    sql += ` AND p.ends_at IS NOT NULL AND p.ends_at <= NOW() + INTERVAL '7 days'`
  }

  switch (sort) {
    case 'biggest_discount':
      sql += ` ORDER BY p.discount_value DESC NULLS LAST, p.is_featured DESC, p.starts_at DESC`
      break
    case 'expiring_soon':
      sql += ` ORDER BY p.ends_at ASC NULLS LAST, p.is_featured DESC`
      break
    case 'sponsored':
      sql += ` ORDER BY (dp.id IS NOT NULL) DESC, p.is_featured DESC, p.starts_at DESC`
      break
    default:
      sql += ` ORDER BY (dp.id IS NOT NULL) DESC, p.is_featured DESC, p.starts_at DESC`
  }

  const { rows } = await query(sql, params)
  return rows.filter((deal) => {
    if (!matchesRestaurantTargeting(deal, restaurant)) return false
    if (deal.is_sponsored && deal.deal_promotion_id) {
      const raw = deal.promotion_target_audience || deal.target_audience
      const audience = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
      return matchesPromotionAudience(audience, restaurant)
    }
    return true
  })
}

export async function loadDealDetailForRestaurant(dealId, restaurantId) {
  const restaurant = await loadRestaurantForTargeting(restaurantId)
  if (!restaurant) return null

  const { rows } = await query(
    `
    SELECT
      p.*,
      s.name AS supplier_name,
      s.slug AS supplier_slug,
      EXISTS (
        SELECT 1 FROM supplier_follow sf
        WHERE sf.supplier_id = p.supplier_id AND sf.restaurant_id = $1
      ) AS is_followed,
      dp.id AS deal_promotion_id,
      dp.budget AS promotion_budget,
      dp.starts_at AS promotion_starts_at,
      dp.ends_at AS promotion_ends_at,
      dp.target_audience AS promotion_target_audience,
      (dp.id IS NOT NULL) AS is_sponsored
    FROM promotions p
    JOIN supplier s ON s.id = p.supplier_id
    LEFT JOIN LATERAL (
      SELECT dp2.*
      FROM deal_promotions dp2
      WHERE dp2.deal_id = p.id
        AND dp2.status = 'active'
        AND dp2.starts_at <= NOW()
        AND (dp2.ends_at IS NULL OR dp2.ends_at > NOW())
      ORDER BY dp2.created_at DESC
      LIMIT 1
    ) dp ON TRUE
    WHERE p.id = $2
      AND p.status = 'active'
      AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
      AND p.boost_start_at IS NOT NULL
      AND p.boost_start_at <= NOW()
      AND p.boost_end_at IS NOT NULL
      AND p.boost_end_at > NOW()
      AND p.starts_at <= NOW()
      AND (p.ends_at IS NULL OR p.ends_at > NOW())
      AND (p.stock_quantity IS NULL OR p.usage_count < p.stock_quantity)
      AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
      AND (
        NOT EXISTS (SELECT 1 FROM promotion_restaurant_targets prt WHERE prt.promotion_id = p.id)
        OR EXISTS (
          SELECT 1 FROM promotion_restaurant_targets prt
          WHERE prt.promotion_id = p.id AND prt.restaurant_id = $1
        )
      )
      AND dp.id IS NOT NULL
    `,
    [restaurantId, dealId]
  )

  const deal = rows[0]
  if (!deal) return null
  if (!matchesRestaurantTargeting(deal, restaurant)) return null
  if (deal.is_sponsored && deal.deal_promotion_id) {
    const raw = deal.promotion_target_audience || deal.target_audience
    const audience = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    if (!matchesPromotionAudience(audience, restaurant)) return null
  }

  const { rows: targets } = await query(
    `
    SELECT pt.product_id, pt.category_id,
      pr.name AS product_name, pr.price AS product_price,
      pc.name AS category_name
    FROM promotion_targets pt
    LEFT JOIN product pr ON pr.id = pt.product_id
    LEFT JOIN product_category pc ON pc.id = pt.category_id
    WHERE pt.promotion_id = $1
    `,
    [dealId]
  )

  return { ...deal, targets }
}

/**
 * Create a paid promotion campaign for a deal (payment stub — marks paid when waived/dev).
 */
export async function createDealPromotionCampaign({
  dealId,
  supplierId,
  pricingKey,
  budget,
  startsAt,
  endsAt,
  targetAudience = {},
  waivePayment = true,
}) {
  let pricing = null
  if (pricingKey) {
    const { rows } = await query(
      `SELECT * FROM promotion_pricing_config WHERE pricing_key = $1 AND is_active = TRUE`,
      [pricingKey]
    )
    pricing = rows[0] || null
  }

  if (pricingKey && !pricing) {
    throw new Error('Boost package is not available')
  }

  const pricePaid = budget ?? pricing?.amount ?? 0
  const resolvedBudget = pricePaid
  const resolvedStarts = startsAt || new Date().toISOString()
  const durationDays = pricing?.duration_days ?? null
  let resolvedEnds = endsAt
  if (!resolvedEnds && durationDays) {
    const end = new Date(resolvedStarts)
    end.setDate(end.getDate() + Number(durationDays))
    resolvedEnds = end.toISOString()
  }

  return withTransaction(async (client) => {
    const { rows: dealRows } = await client.query(
      `SELECT * FROM promotions WHERE id = $1 AND supplier_id = $2`,
      [dealId, supplierId]
    )
    if (!dealRows.length) throw new Error('Deal not found')
    const deal = dealRows[0]
    if (deal.status !== 'active') {
      throw new Error('Only active deals can be promoted')
    }

    const billingStatus = waivePayment ? 'waived' : 'pending'
    const status = waivePayment ? 'active' : 'draft'

    const { rows } = await client.query(
      `
      INSERT INTO deal_promotions (
        deal_id, supplier_id, budget, starts_at, ends_at, target_audience,
        billing_type, billing_status, status,
        pricing_package_id, pricing_key, price_paid, duration_days, package_display_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
      `,
      [
        dealId,
        supplierId,
        resolvedBudget,
        resolvedStarts,
        resolvedEnds ?? null,
        JSON.stringify(targetAudience),
        pricing?.billing_type || 'flat_fee',
        billingStatus,
        status,
        pricing?.id ?? null,
        pricing?.pricing_key ?? pricingKey ?? null,
        pricePaid,
        durationDays,
        pricing?.display_name ?? null,
      ]
    )
    return rows[0]
  })
}

export async function getDealAnalytics(dealId, supplierId) {
  const { rows: usage } = await query(
    `
    SELECT
      COUNT(*)::int AS usage_count,
      COALESCE(SUM(pu.discount_applied), 0)::numeric AS total_discount,
      COUNT(DISTINCT pu.order_id)::int AS orders_influenced
    FROM promotion_usages pu
    WHERE pu.promotion_id = $1
    `,
    [dealId]
  )

  const { rows: interactions } = await query(
    `
    SELECT interaction_type, COUNT(*)::int AS count
    FROM deal_interactions
    WHERE deal_id = $1 AND supplier_id = $2
    GROUP BY interaction_type
    `,
    [dealId, supplierId]
  )

  const { rows: promotionRows } = await query(
    `SELECT * FROM deal_promotions WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [dealId]
  )

  const { rows: uniqueViews } = await query(
    `SELECT COUNT(*)::int AS unique_views FROM deal_restaurant_views WHERE deal_id = $1`,
    [dealId]
  )

  const interactionMap = Object.fromEntries(interactions.map((r) => [r.interaction_type, r.count]))
  const promo = promotionRows[0]
  const views = interactionMap.view || 0
  const uniqueRestaurantViews = uniqueViews[0]?.unique_views || 0
  const clicks = interactionMap.click || 0
  const orders = usage[0]?.orders_influenced || 0
  const conversionRate = views > 0 ? Math.round((orders / views) * 10000) / 100 : 0

  return {
    ...usage[0],
    views,
    uniqueRestaurantViews,
    clicks,
    addToCart: interactionMap.add_to_cart || 0,
    applyToCart: interactionMap.apply_to_cart || 0,
    messages: interactionMap.message || 0,
    couponUses: interactionMap.coupon_used || 0,
    conversionRate,
    promotion: promo
      ? {
          id: promo.id,
          budget: promo.budget,
          impressions: promo.impressions,
          clicks: promo.clicks,
          orders: promo.orders_count,
          messages: promo.messages_count,
          couponUses: promo.coupon_uses,
          status: promo.status,
          startsAt: promo.starts_at,
          endsAt: promo.ends_at,
        }
      : null,
  }
}

/** Aggregate deal performance across all supplier promotions (for promotions workspace dashboard). */
export async function getSupplierDealsAnalyticsSummary(supplierId, { days = 30 } = {}) {
  const daysInt = Math.min(Math.max(Number(days) || 30, 1), 365)

  const { rows: dealCounts } = await query(
    `
    SELECT
      COUNT(*)::int AS total_deals,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active_deals,
      COUNT(*) FILTER (WHERE status IN ('pending_approval', 'pending_admin_approval'))::int AS pending_deals
    FROM promotions
    WHERE supplier_id = $1
    `,
    [supplierId]
  )

  const { rows: interactionRows } = await query(
    `
    SELECT interaction_type, COUNT(*)::int AS count
    FROM deal_interactions
    WHERE supplier_id = $1
      AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
    GROUP BY interaction_type
    `,
    [supplierId, daysInt]
  )

  const { rows: usageRows } = await query(
    `
    SELECT
      COUNT(DISTINCT pu.order_id)::int AS orders_influenced,
      COALESCE(SUM(pu.discount_applied), 0)::numeric AS total_discount,
      COUNT(*)::int AS usage_count
    FROM promotion_usages pu
    JOIN promotions p ON p.id = pu.promotion_id
    WHERE p.supplier_id = $1
      AND pu.applied_at >= NOW() - ($2::int * INTERVAL '1 day')
    `,
    [supplierId, daysInt]
  )

  const { rows: topDeals } = await query(
    `
    SELECT p.id, p.name, p.status,
      COUNT(di.id) FILTER (WHERE di.interaction_type = 'view')::int AS views,
      COUNT(di.id) FILTER (WHERE di.interaction_type = 'click')::int AS clicks,
      COUNT(DISTINCT pu.order_id)::int AS orders_influenced
    FROM promotions p
    LEFT JOIN deal_interactions di ON di.deal_id = p.id
      AND di.created_at >= NOW() - ($2::int * INTERVAL '1 day')
    LEFT JOIN promotion_usages pu ON pu.promotion_id = p.id
      AND pu.applied_at >= NOW() - ($2::int * INTERVAL '1 day')
    WHERE p.supplier_id = $1
    GROUP BY p.id, p.name, p.status
    ORDER BY views DESC, clicks DESC
    LIMIT 5
    `,
    [supplierId, daysInt]
  )

  const interactionMap = Object.fromEntries(
    interactionRows.map((r) => [r.interaction_type, r.count])
  )
  const views = interactionMap.view || 0
  const clicks = interactionMap.click || 0
  const orders = usageRows[0]?.orders_influenced || 0
  const conversionRate = views > 0 ? Math.round((orders / views) * 10000) / 100 : 0

  return {
    periodDays: daysInt,
    totalDeals: dealCounts[0]?.total_deals || 0,
    activeDeals: dealCounts[0]?.active_deals || 0,
    pendingDeals: dealCounts[0]?.pending_deals || 0,
    views,
    clicks,
    ordersInfluenced: orders,
    couponUses: interactionMap.coupon_used || 0,
    messages: interactionMap.message || 0,
    totalDiscount: Number(usageRows[0]?.total_discount || 0),
    conversionRate,
    topDeals,
  }
}

async function insertPromotionUsageSnapshot(
  client,
  { promotion, orderId, restaurantId, discountAmount }
) {
  const deliveryDiscount = promotion.type === 'free_shipping' ? Number(discountAmount) || 0 : 0
  const snapshot = buildDealConfigSnapshot(promotion)
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
      promotion.supplier_id,
      promotion.type,
      promotion.discount_value,
      deliveryDiscount,
      JSON.stringify(snapshot),
    ]
  )
}

export async function previewDealForCart({
  promotionId,
  couponCode,
  supplierId,
  restaurantId,
  subtotal,
  lineItems,
}) {
  let promotion = null
  if (promotionId) {
    const { rows } = await query(
      `SELECT p.* FROM promotions p WHERE p.id = $1 AND p.supplier_id = $2`,
      [promotionId, supplierId]
    )
    promotion = rows[0] || null
  } else if (couponCode?.trim()) {
    const { rows } = await query(
      `SELECT p.* FROM promotions p
       WHERE p.supplier_id = $1 AND lower(p.coupon_code) = lower($2)`,
      [supplierId, couponCode.trim()]
    )
    promotion = rows[0] || null
  }

  if (!promotion) {
    return { eligible: false, reason: 'Deal not found for this supplier' }
  }

  if (!isRestaurantVisibleDeal(promotion, { restaurantId })) {
    return {
      eligible: false,
      reason: getRestaurantIneligibilityMessage(promotion, { restaurantId }),
      deal: { id: promotion.id, name: promotion.name, type: promotion.type },
    }
  }

  const discountAmount = calculatePromotionDiscount(promotion, subtotal, lineItems)
  if (discountAmount <= 0) {
    const minOrder = promotion.min_order_amount
    if (minOrder != null && Number(subtotal) < Number(minOrder)) {
      return {
        eligible: false,
        reason: `Minimum order value not reached ($${Number(minOrder).toFixed(2)} required)`,
        deal: { id: promotion.id, name: promotion.name, type: promotion.type },
      }
    }
    const minQty = promotion.min_order_quantity
    if (minQty != null) {
      const units = (lineItems || []).reduce((s, l) => s + Number(l.quantity || 0), 0)
      if (units < Number(minQty)) {
        return {
          eligible: false,
          reason: `Add ${Number(minQty) - units} more unit(s) to unlock this deal`,
          deal: { id: promotion.id, name: promotion.name, type: promotion.type },
        }
      }
    }
    return {
      eligible: false,
      reason: 'This deal does not apply to your cart items',
      deal: { id: promotion.id, name: promotion.name, type: promotion.type },
    }
  }

  return {
    eligible: true,
    deal: {
      id: promotion.id,
      name: promotion.name,
      type: promotion.type,
      typeLabel: getDealTypeLabel(promotion.type),
      startsAt: promotion.starts_at,
      endsAt: promotion.ends_at,
    },
    discountAmount,
    discountLabel: getDealDiscountDisplayLabel(promotion, discountAmount),
    subtotal: Number(subtotal),
    totalAfterDiscount: Math.max(0, Number(subtotal) - discountAmount),
  }
}

export async function enrichPromotionRow(row) {
  const [enriched] = await enrichPromotionRows([row])
  return enriched
}

/**
 * Batch-enrich promotion rows (avoids N+1 queries on list endpoints).
 */
export async function enrichPromotionRows(rows) {
  if (!rows?.length) return []
  const ids = rows.map((r) => r.id)
  const { rows: targets } = await query(
    `SELECT promotion_id, product_id, category_id FROM promotion_targets WHERE promotion_id = ANY($1::uuid[])`,
    [ids]
  )
  const { rows: latestPromos } = await query(
    `
    SELECT DISTINCT ON (deal_id)
      deal_id, id, starts_at, ends_at, status,
      pricing_key, price_paid, duration_days, package_display_name, budget
    FROM deal_promotions
    WHERE deal_id = ANY($1::uuid[])
    ORDER BY deal_id, created_at DESC
    `,
    [ids]
  )
  const targetsByDeal = new Map()
  for (const t of targets) {
    const list = targetsByDeal.get(t.promotion_id) || {
      productIds: [],
      categoryIds: [],
    }
    if (t.product_id) list.productIds.push(t.product_id)
    if (t.category_id) list.categoryIds.push(t.category_id)
    targetsByDeal.set(t.promotion_id, list)
  }
  const latestByDeal = new Map(latestPromos.map((p) => [p.deal_id, p]))
  const now = Date.now()

  return rows.map((row) => {
    const t = targetsByDeal.get(row.id) || { productIds: [], categoryIds: [] }
    const latestPromo = latestByDeal.get(row.id) || null
    const boostStart = row.boost_start_at
    const boostEnd = row.boost_end_at
    const isCurrentlyBoosted =
      row.status === 'active' &&
      boostStart &&
      boostEnd &&
      new Date(boostStart).getTime() <= now &&
      new Date(boostEnd).getTime() > now

    const syntheticPromo = isCurrentlyBoosted
      ? {
          starts_at: boostStart,
          ends_at: boostEnd,
          package_display_name: latestPromo?.package_display_name,
          pricing_key: row.boost_pricing_key,
          price_paid: row.boost_price_snapshot,
          duration_days: row.boost_duration_days,
        }
      : latestPromo ||
        (row.boost_end_at
          ? {
              starts_at: row.boost_start_at,
              ends_at: row.boost_end_at,
              package_display_name: null,
              pricing_key: row.boost_pricing_key,
              price_paid: row.boost_price_snapshot,
              duration_days: row.boost_duration_days,
            }
          : null)

    const boostStatus = buildBoostStatus(syntheticPromo)

    return {
      ...row,
      target_product_ids: t.productIds,
      target_category_ids: t.categoryIds,
      is_promoted: Boolean(isCurrentlyBoosted),
      active_deal_promotion_id: isCurrentlyBoosted ? latestPromo?.id : null,
      boost_status: boostStatus,
    }
  })
}

export async function applyPromotionByIdToOrder({
  client,
  promotionId,
  orderId,
  supplierId,
  restaurantId,
  subtotal,
  lineItems,
}) {
  const { isFeatureEnabled, checkLimit, incrementUsage } = await import('../lib/subscription.js')
  const dealsEnabled = await isFeatureEnabled(restaurantId, 'RESTAURANT', 'supplier_deals')
  if (!dealsEnabled) return null

  const redemptionLimit = await checkLimit(restaurantId, 'RESTAURANT', 'deal_redemptions_per_day')
  if (redemptionLimit.isOverLimit && !redemptionLimit.isUnlimited) {
    return null
  }

  const { rows } = await client.query(
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
    WHERE p.id = $1 AND p.supplier_id = $2
    `,
    [promotionId, supplierId]
  )
  const promotion = rows[0]
  if (!promotion || !isPromotionEligible(promotion, { restaurantId })) return null

  const discountAmount = calculatePromotionDiscount(promotion, subtotal, lineItems)
  if (discountAmount <= 0) return null

  const newTotal = Math.max(0, Number(subtotal) - discountAmount)

  await client.query(
    `UPDATE customer_order SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
    [newTotal, orderId]
  )

  await insertPromotionUsageSnapshot(client, {
    promotion,
    orderId,
    restaurantId,
    discountAmount,
  })

  await client.query(
    `UPDATE promotions SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`,
    [promotion.id]
  )

  const activePromo = await getActiveDealPromotion(client, promotion.id)
  await incrementUsage(restaurantId, 'RESTAURANT', 'deal_redemptions_per_day', 1)
  await recordDealInteraction({
    dealId: promotion.id,
    restaurantId,
    supplierId,
    interactionType: 'order',
    metadata: { orderId, discountAmount },
    dealPromotionId: activePromo?.id || null,
  })

  return {
    promotionId: promotion.id,
    promotionName: promotion.name,
    promotionType: promotion.type,
    discountAmount,
    discountLabel: getDealDiscountDisplayLabel(promotion, discountAmount),
    totalAfterDiscount: newTotal,
  }
}

export async function validateCouponForOrder({
  couponCode,
  supplierId,
  restaurantId,
  subtotal,
  lineItems,
}) {
  if (!couponCode?.trim()) return null
  const { rows } = await query(
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
      AND lower(p.coupon_code) = lower($2)
      AND p.status = 'active'
    `,
    [supplierId, couponCode.trim()]
  )
  const promotion = rows[0]
  if (!promotion || !isPromotionEligible(promotion, { restaurantId })) return null
  const discountAmount = calculatePromotionDiscount(promotion, subtotal, lineItems)
  if (discountAmount <= 0) return null
  return { promotion, discountAmount }
}

export async function getEligibleProductsForDeal(dealId, supplierId) {
  const { rows: dealRows } = await query(
    `SELECT applies_to FROM promotions WHERE id = $1 AND supplier_id = $2`,
    [dealId, supplierId]
  )
  if (!dealRows.length) return []
  const deal = dealRows[0]

  if (deal.applies_to === 'all') {
    const { rows } = await query(
      `SELECT id, name, sku, price, image_url, category_id FROM product
       WHERE supplier_id = $1 AND is_active = TRUE ORDER BY name`,
      [supplierId]
    )
    return rows
  }

  const { rows } = await query(
    `
    SELECT DISTINCT pr.id, pr.name, pr.sku, pr.price, pr.image_url, pr.category_id
    FROM product pr
    LEFT JOIN promotion_targets pt ON pt.promotion_id = $1
    WHERE pr.supplier_id = $2 AND pr.is_active = TRUE
      AND (
        (pt.product_id IS NOT NULL AND pr.id = pt.product_id)
        OR (pt.category_id IS NOT NULL AND pr.category_id = pt.category_id)
      )
    ORDER BY pr.name
    `,
    [dealId, supplierId]
  )
  return rows
}
