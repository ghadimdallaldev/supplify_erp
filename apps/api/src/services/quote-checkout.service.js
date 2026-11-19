import { ValidationError } from '../middlewares/errorHandler.js'

/** Lock quote parents before reading their current lines; response/close writers use the same parents. */
export async function lockCheckoutQuoteRows(client, { restaurantId, productIds, quoteLocks = [] }) {
  if (!productIds.length) return []
  const { rows: requests } = await client.query(
    `SELECT qr.id, qr.status FROM quote_requests qr
     WHERE qr.restaurant_id = $1 AND (
       (qr.status = 'open' AND EXISTS (
         SELECT 1 FROM quote_request_items requested
         LEFT JOIN quote_response_items offered ON offered.quote_request_item_id = requested.id
         WHERE requested.quote_request_id = qr.id
           AND (requested.product_id = ANY($2::uuid[]) OR offered.substitute_product_id = ANY($2::uuid[]))
       )) OR EXISTS (
         SELECT 1 FROM quote_request_suppliers selected
         WHERE selected.quote_request_id = qr.id AND selected.id = ANY($3::uuid[])
       )
     ) ORDER BY qr.id FOR SHARE OF qr`,
    [restaurantId, productIds, [...new Set(quoteLocks.map((lock) => lock.quoteRequestSupplierId))]]
  )
  const openIds = requests.filter((row) => row.status === 'open').map((row) => row.id)
  if (!openIds.length) return []
  const { rows } = await client.query(
    `SELECT qri.id AS quote_response_item_id, qrs.id AS quote_request_supplier_id,
       COALESCE(qri.substitute_product_id, requested.product_id) AS product_id,
       p.supplier_id, qri.unit_price, qri.quantity,
       COALESCE(NULLIF(qri.currency, ''), catalog.currency, 'USD') AS currency
     FROM quote_requests qr
     JOIN quote_request_suppliers qrs ON qrs.quote_request_id = qr.id
     JOIN quote_responses response ON response.quote_request_supplier_id = qrs.id
     JOIN quote_response_items qri ON qri.quote_response_id = response.id
     JOIN quote_request_items requested ON requested.id = qri.quote_request_item_id AND requested.quote_request_id = qr.id
     JOIN product p ON p.id = requested.product_id AND p.supplier_id = qrs.supplier_id
     LEFT JOIN product substitute ON substitute.id = qri.substitute_product_id AND substitute.supplier_id = qrs.supplier_id
     LEFT JOIN LATERAL (
       SELECT currency FROM price
       WHERE product_id = COALESCE(qri.substitute_product_id, requested.product_id)
         AND valid_from <= now() AND (valid_to IS NULL OR valid_to >= now())
       ORDER BY (CASE WHEN min_qty <= 1 THEN 0 ELSE 1 END), valid_from DESC
       LIMIT 1 FOR SHARE
     ) catalog ON true
     WHERE qr.id = ANY($1::uuid[]) AND qr.restaurant_id = $3 AND qr.status = 'open'
       AND qrs.status = 'responded' AND qri.is_available = true AND qri.unit_price IS NOT NULL
       AND (qri.substitute_product_id IS NULL OR substitute.id IS NOT NULL)
       AND COALESCE(qri.substitute_product_id, requested.product_id) = ANY($2::uuid[])
     ORDER BY response.submitted_at DESC, qrs.id, qri.id
     FOR SHARE OF qrs, response, qri, requested, p`,
    [openIds, productIds, restaurantId]
  )
  return rows
}

export function autoCheckoutQuoteLocks(rows, supplierId) {
  const byProduct = new Map()
  for (const row of rows) {
    if (row.supplier_id !== supplierId || byProduct.has(row.product_id)) continue
    byProduct.set(row.product_id, {
      productId: row.product_id,
      quoteRequestSupplierId: row.quote_request_supplier_id,
      quoteResponseItemId: row.quote_response_item_id,
    })
  }
  return [...byProduct.values()]
}

/** Compare prepared checkout prices with locked, current quotes before any order writes. */
export function assertCheckoutQuotePrices({ rows, lines, quoteLocks = [] }) {
  const locks = new Map(quoteLocks.map((lock) => [lock.productId, lock]))
  const byId = new Map(rows.map((row) => [row.quote_response_item_id, row]))
  for (const line of lines) {
    const lock = locks.get(line.productId)
    const label = line.product?.sku || line.productId
    if (!lock) {
      if (
        line.pricingSource === 'QUOTE_PRICE' ||
        rows.some((row) => row.product_id === line.productId && row.supplier_id === line.supplierId)
      ) {
        throw new ValidationError(
          `An open quote exists for ${label}. Refresh the quote and include its quoteLocks before ordering.`
        )
      }
      continue
    }
    const current = byId.get(lock.quoteResponseItemId)
    if (
      !current ||
      current.quote_request_supplier_id !== lock.quoteRequestSupplierId ||
      current.product_id !== line.productId ||
      current.supplier_id !== line.supplierId ||
      line.pricingSource !== 'QUOTE_PRICE' ||
      line.quoteResponseItemId !== lock.quoteResponseItemId ||
      !Number.isFinite(Number(current.unit_price)) ||
      Number(current.unit_price) < 0 ||
      Number(current.unit_price) !== Number(line.unitPrice) ||
      current.currency !== line.currency
    ) {
      throw new ValidationError(
        `Quoted price is no longer available or has changed for ${label}. Refresh the quote before ordering.`
      )
    }
    if (current.quantity != null && Number(line.quantity) > Number(current.quantity)) {
      throw new ValidationError(
        `Ordered quantity for ${label} exceeds the current quoted quantity of ${current.quantity}`
      )
    }
  }
}
