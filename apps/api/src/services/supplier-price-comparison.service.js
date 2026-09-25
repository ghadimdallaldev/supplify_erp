import { query } from '../lib/db.js'

function normalized(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en')
}

export async function listCommonProductBestPrices(restaurantId, { search = '', limit = 30 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100)
  const { rows } = await query(
    `
    SELECT
      p.id AS "productId",
      p.name AS "productName",
      p.brand,
      p.unit,
      COALESCE(s.organization_id, s.id) AS "supplierId",
      COALESCE(so.name, s.name) AS "supplierName",
      current_price.amount,
      current_price.currency,
      current_price.min_qty AS "minQty"
    FROM product p
    JOIN supplier s ON s.id = p.supplier_id
    LEFT JOIN supplier_organizations so ON so.id = s.organization_id
    JOIN LATERAL (
      SELECT pr.amount, pr.currency, pr.min_qty
      FROM price pr
      WHERE pr.product_id = p.id
        AND pr.valid_from <= now()
        AND (pr.valid_to IS NULL OR pr.valid_to >= now())
      ORDER BY (CASE WHEN COALESCE(pr.min_qty, 1) <= 1 THEN 0 ELSE 1 END), pr.amount ASC, pr.min_qty ASC
      LIMIT 1
    ) current_price ON true
    WHERE EXISTS (
      SELECT 1
      FROM supplier_follow sf
      JOIN supplier followed_supplier ON followed_supplier.id = sf.supplier_id
      WHERE sf.restaurant_id = $1
        AND COALESCE(followed_supplier.organization_id, followed_supplier.id) =
            COALESCE(s.organization_id, s.id)
    )
      AND (
        $2::text = '' OR p.name ILIKE '%' || $2 || '%'
        OR COALESCE(p.brand, '') ILIKE '%' || $2 || '%'
      )
    ORDER BY p.name, current_price.currency, current_price.amount
    LIMIT 1000
    `,
    [restaurantId, String(search || '').trim()]
  )

  const groups = new Map()
  for (const row of rows) {
    const tier = row.minQty == null || Number(row.minQty) <= 1 ? '1' : String(row.minQty)
    const key = [
      normalized(row.productName),
      normalized(row.unit),
      normalized(row.brand),
      String(row.currency || '').toUpperCase(),
      tier,
    ].join('|')
    if (!groups.has(key)) {
      groups.set(key, {
        productName: row.productName,
        brand: row.brand || null,
        unit: row.unit || null,
        currency: row.currency,
        offersBySupplier: new Map(),
      })
    }
    const group = groups.get(key)
    const current = group.offersBySupplier.get(row.supplierId)
    if (!current || Number(row.amount) < Number(current.amount)) {
      group.offersBySupplier.set(row.supplierId, row)
    }
  }

  return [...groups.values()]
    .map((group) => {
      const offers = [...group.offersBySupplier.values()].sort(
        (left, right) => Number(left.amount) - Number(right.amount)
      )
      if (offers.length < 2) return null
      const best = offers[0]
      const highest = offers[offers.length - 1]
      const savings = Number(highest.amount) - Number(best.amount)
      return {
        productName: group.productName,
        brand: group.brand,
        unit: group.unit,
        currency: group.currency,
        bestOffer: best,
        offers,
        supplierCount: offers.length,
        savings: Number(savings.toFixed(3)),
        savingsPercent:
          Number(highest.amount) > 0
            ? Number(((savings / Number(highest.amount)) * 100).toFixed(1))
            : 0,
      }
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.savings - left.savings || left.productName.localeCompare(right.productName)
    )
    .slice(0, safeLimit)
}
