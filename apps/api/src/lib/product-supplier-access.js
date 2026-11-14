/** Organization-aware supplier access for a restaurant product detail. */
export const RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL = `
  SELECT 1
  FROM supplier s
  JOIN supplier_follow sf ON TRUE
  JOIN supplier followed_supplier ON followed_supplier.id = sf.supplier_id
  WHERE s.id = $1
    AND COALESCE(followed_supplier.organization_id, followed_supplier.id) =
        COALESCE(s.organization_id, s.id)
    AND sf.restaurant_id = $2
    AND NOT EXISTS (
      SELECT 1 FROM supplier_blocklist sb
      JOIN supplier blocked_supplier ON blocked_supplier.id = sb.supplier_id
      WHERE COALESCE(blocked_supplier.organization_id, blocked_supplier.id) =
            COALESCE(s.organization_id, s.id)
        AND sb.restaurant_id = $2
    )
  UNION
  SELECT 1
  FROM supplier s
  JOIN customer_order o ON TRUE
  JOIN order_item oi ON oi.order_id = o.id
  JOIN supplier historical_supplier ON historical_supplier.id = oi.supplier_id
  WHERE s.id = $1 AND o.restaurant_id = $2
    AND COALESCE(historical_supplier.organization_id, historical_supplier.id) =
        COALESCE(s.organization_id, s.id)
  LIMIT 1
`
