import { query } from '../lib/db.js'
import { discoverDealsForRestaurant } from './deal-promotions.service.js'

const BANNER_LOOKBACK_DAYS = 14

/**
 * Active deals eligible for the restaurant new-deals banner (no boost required).
 */
export async function getNewDealsBanner(restaurantId) {
  // Start from the same eligible deals as the destination page. Banner-only
  // recency and dismissals must never advertise an inaccessible offer.
  const eligible = await discoverDealsForRestaurant(restaurantId, { sort: 'newest' })
  const cutoff = Date.now() - BANNER_LOOKBACK_DAYS * 86_400_000
  const recent = eligible.filter((deal) => new Date(deal.starts_at).getTime() >= cutoff)
  if (!recent.length) return { deals: [], summary: null }
  const { rows: dismissed } = await query(
    `SELECT deal_id FROM deal_interactions
     WHERE restaurant_id = $1 AND interaction_type = 'banner_dismiss'
       AND deal_id = ANY($2::uuid[])`,
    [restaurantId, recent.map((deal) => deal.id)]
  )
  const dismissedIds = new Set(dismissed.map((row) => row.deal_id))

  const deals = recent
    .filter((deal) => !dismissedIds.has(deal.id))
    .slice(0, 10)
    .map((d) => ({
      id: d.id,
      name: d.name,
      supplierId: d.supplier_id,
      supplierName: d.supplier_name,
      discountType: d.type,
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
