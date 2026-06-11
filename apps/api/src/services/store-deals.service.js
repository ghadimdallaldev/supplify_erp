import { query } from '../lib/db.js'

/**
 * User-facing label for an active store-wide discount (supplier list badges).
 */
export function formatStoreDealLabel(type, discountValue) {
  const value = Number(discountValue) || 0
  if (type === 'percentage_discount') return `${value}% off`
  if (type === 'fixed_discount') return `$${value.toFixed(2)} off`
  return null
}

/**
 * Batch-load the best active store-wide deal per supplier (no N+1).
 * Store-wide = applies_to 'all', active percentage or fixed discount within schedule.
 */
export async function getActiveStoreWideDealsBatch(supplierIds, restaurantId = null) {
  if (!supplierIds?.length) return new Map()

  const params = [supplierIds]
  let restaurantClause = ''
  if (restaurantId) {
    params.push(restaurantId)
    restaurantClause = `
      AND (
        NOT EXISTS (SELECT 1 FROM promotion_restaurant_targets prt WHERE prt.promotion_id = p.id)
        OR EXISTS (
          SELECT 1 FROM promotion_restaurant_targets prt
          WHERE prt.promotion_id = p.id AND prt.restaurant_id = $2
        )
      )
    `
  }

  const { rows } = await query(
    `
    SELECT DISTINCT ON (p.supplier_id)
      p.supplier_id,
      p.id,
      p.type,
      p.discount_value
    FROM promotions p
    WHERE p.supplier_id = ANY($1::uuid[])
      AND p.status = 'active'
      AND p.applies_to = 'all'
      AND p.type IN ('percentage_discount', 'fixed_discount')
      AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
      AND p.starts_at <= NOW()
      AND (p.ends_at IS NULL OR p.ends_at > NOW())
      AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
      ${restaurantClause}
    ORDER BY
      p.supplier_id,
      CASE WHEN p.type = 'percentage_discount' THEN 0 ELSE 1 END,
      p.discount_value DESC,
      p.is_featured DESC,
      p.starts_at DESC
    `,
    params
  )

  const map = new Map()
  for (const row of rows) {
    map.set(row.supplier_id, {
      id: row.id,
      type: row.type,
      discount_value: Number(row.discount_value) || 0,
      label: formatStoreDealLabel(row.type, row.discount_value),
    })
  }
  return map
}
