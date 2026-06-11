import { query } from '../lib/db.js'
import {
  loadRestaurantForTargeting,
  matchesRestaurantTargeting,
} from './deal-promotions.service.js'

const BANNER_LOOKBACK_DAYS = 14

/**
 * Active deals eligible for the restaurant new-deals banner (no boost required).
 */
export async function getNewDealsBanner(restaurantId) {
  const restaurant = await loadRestaurantForTargeting(restaurantId)
  if (!restaurant) return { deals: [], summary: null }

  const { rows } = await query(
    `
    SELECT
      p.id,
      p.name,
      p.type AS discount_type,
      p.discount_value,
      p.starts_at,
      p.ends_at,
      p.supplier_id,
      p.target_restaurant_types,
      p.target_areas,
      s.name AS supplier_name,
      EXISTS (
        SELECT 1 FROM supplier_follow sf
        WHERE sf.supplier_id = p.supplier_id AND sf.restaurant_id = $1
      ) AS is_followed
    FROM promotions p
    JOIN supplier s ON s.id = p.supplier_id
    WHERE p.status = 'active'
      AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
      AND p.starts_at <= NOW()
      AND (p.ends_at IS NULL OR p.ends_at > NOW())
      AND p.starts_at >= NOW() - ($2::int || ' days')::interval
      AND (
        EXISTS (
          SELECT 1 FROM supplier_follow sf
          WHERE sf.supplier_id = p.supplier_id AND sf.restaurant_id = $1
        )
        OR EXISTS (
          SELECT 1 FROM promotion_restaurant_targets prt
          WHERE prt.promotion_id = p.id AND prt.restaurant_id = $1
        )
        OR NOT EXISTS (
          SELECT 1 FROM promotion_restaurant_targets prt WHERE prt.promotion_id = p.id
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM deal_interactions di
        WHERE di.deal_id = p.id
          AND di.restaurant_id = $1
          AND di.interaction_type = 'banner_dismiss'
      )
    ORDER BY p.starts_at DESC
    LIMIT 10
    `,
    [restaurantId, BANNER_LOOKBACK_DAYS]
  )

  const deals = rows
    .filter((deal) => matchesRestaurantTargeting(deal, restaurant))
    .map((d) => ({
      id: d.id,
      name: d.name,
      supplierId: d.supplier_id,
      supplierName: d.supplier_name,
      discountType: d.discount_type,
      discountValue: d.discount_value,
      isFollowed: d.is_followed,
      startsAt: d.starts_at,
    }))

  if (deals.length === 0) {
    return { deals: [], summary: null }
  }

  const summary =
    deals.length > 1
      ? {
          count: deals.length,
          title: `${deals.length} new deals from your suppliers`,
          supplierNames: [...new Set(deals.map((d) => d.supplierName))].slice(0, 3),
        }
      : {
          count: 1,
          title: `New deal from ${deals[0].supplierName}`,
          dealName: deals[0].name,
          dealId: deals[0].id,
        }

  return { deals, summary }
}

export async function dismissDealBanner(restaurantId, dealId, supplierId) {
  await query(
    `
    INSERT INTO deal_interactions (
      deal_id, restaurant_id, supplier_id, interaction_type, metadata
    ) VALUES ($1, $2, $3, 'banner_dismiss', '{}')
    ON CONFLICT DO NOTHING
    `,
    [dealId, restaurantId, supplierId]
  )
}
