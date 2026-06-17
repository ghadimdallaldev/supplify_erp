import { query } from '../lib/db.js'

/**
 * Fetch the current catalog price for a product.
 * @param {string} productId
 * @param {Function} dbQuery
 * @returns {Promise<{ amount: number, currency: string } | null>}
 */
export async function getDefaultCatalogPrice(productId, dbQuery = query) {
  const { rows } = await dbQuery(
    `
    SELECT amount, currency
    FROM price
    WHERE product_id = $1
      AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
    ORDER BY valid_from DESC
    LIMIT 1
    `,
    [productId]
  )
  if (!rows.length || rows[0].amount == null) return null
  return {
    amount: Number(rows[0].amount),
    currency: rows[0].currency || 'USD',
  }
}

/**
 * Batch-fetch catalog prices for multiple products.
 * @param {string[]} productIds
 * @param {Function} dbQuery
 */
export async function getDefaultCatalogPricesBatch(productIds, dbQuery = query) {
  if (!productIds.length) return new Map()
  const { rows } = await dbQuery(
    `
    SELECT DISTINCT ON (product_id) product_id, amount, currency
    FROM price
    WHERE product_id = ANY($1::uuid[])
      AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
    ORDER BY product_id, valid_from DESC
    `,
    [productIds]
  )
  return new Map(
    rows.map((r) => [r.product_id, { amount: Number(r.amount), currency: r.currency || 'USD' }])
  )
}

function toDateOnly(value) {
  if (!value) return new Date()
  if (value instanceof Date) return value
  return new Date(value)
}

function buildDefaultResolution(defaultPrice, currency = 'USD') {
  return {
    unitPrice: defaultPrice,
    source: 'DEFAULT_PRICE',
    defaultPrice,
    contractPriceId: null,
    quoteResponseItemId: null,
    discountPercent: null,
    validFrom: null,
    validUntil: null,
    currency,
    minOrderQuantity: null,
  }
}

function buildQuoteResolution({ unitPrice, currency, defaultPrice, quoteResponseItemId }) {
  return {
    unitPrice,
    source: 'QUOTE_PRICE',
    defaultPrice,
    contractPriceId: null,
    quoteResponseItemId,
    discountPercent: null,
    validFrom: null,
    validUntil: null,
    currency,
    minOrderQuantity: null,
  }
}

/**
 * Resolve locked quote price for checkout when cart carries quote response item ids.
 * @param {{
 *   restaurantId: string,
 *   quoteRequestSupplierId: string,
 *   quoteResponseItemId: string,
 *   productId?: string,
 *   supplierId?: string,
 * }} params
 * @param {Function} dbQuery
 * @returns {Promise<ReturnType<typeof buildQuoteResolution> | null>}
 */
export async function resolveQuotePrice(
  { restaurantId, quoteRequestSupplierId, quoteResponseItemId, productId, supplierId },
  dbQuery = query
) {
  const { rows } = await dbQuery(
    `
    SELECT
      qri.id,
      qri.unit_price,
      qri.currency,
      qreq.product_id,
      p.supplier_id
    FROM quote_response_items qri
    JOIN quote_responses qr_resp ON qr_resp.id = qri.quote_response_id
    JOIN quote_request_suppliers qrs ON qrs.id = qr_resp.quote_request_supplier_id
    JOIN quote_requests qr ON qr.id = qrs.quote_request_id
    JOIN quote_request_items qreq ON qreq.id = qri.quote_request_item_id
    JOIN product p ON p.id = qreq.product_id
    WHERE qri.id = $1
      AND qrs.id = $2
      AND qr.restaurant_id = $3
      AND qrs.status = 'responded'
      AND qri.is_available = true
    `,
    [quoteResponseItemId, quoteRequestSupplierId, restaurantId]
  )

  if (!rows.length || rows[0].unit_price == null) return null

  const row = rows[0]
  if (productId && row.product_id !== productId) return null
  if (supplierId && row.supplier_id !== supplierId) return null

  const catalog = await getDefaultCatalogPrice(row.product_id, dbQuery)
  const defaultPrice = catalog?.amount ?? null
  const currency = row.currency || catalog?.currency || 'USD'

  return buildQuoteResolution({
    unitPrice: Number(row.unit_price),
    currency,
    defaultPrice,
    quoteResponseItemId: row.id,
  })
}

async function resolveQuotePricesBatch({ restaurantId, quoteLocks }, dbQuery = query) {
  if (!quoteLocks?.length) return new Map()

  const qrsIds = quoteLocks.map((l) => l.quoteRequestSupplierId)
  const qriIds = quoteLocks.map((l) => l.quoteResponseItemId)

  const { rows } = await dbQuery(
    `
    SELECT
      qri.id AS quote_response_item_id,
      qri.unit_price,
      qri.currency,
      qreq.product_id,
      p.supplier_id,
      qrs.id AS quote_request_supplier_id
    FROM unnest($1::uuid[], $2::uuid[]) AS v(qrs_id, qri_id)
    JOIN quote_request_suppliers qrs ON qrs.id = v.qrs_id
    JOIN quote_responses qr_resp
      ON qr_resp.quote_request_supplier_id = qrs.id
    JOIN quote_response_items qri
      ON qri.id = v.qri_id AND qri.quote_response_id = qr_resp.id
    JOIN quote_requests qr ON qr.id = qrs.quote_request_id
    JOIN quote_request_items qreq ON qreq.id = qri.quote_request_item_id
    JOIN product p ON p.id = qreq.product_id
    WHERE qr.restaurant_id = $3
      AND qrs.status = 'responded'
      AND qri.is_available = true
    `,
    [qrsIds, qriIds, restaurantId]
  )

  const lockByProductId = new Map(quoteLocks.map((l) => [l.productId, l]))

  const productIds = [...new Set(rows.map((r) => r.product_id))]
  const catalogMap = await getDefaultCatalogPricesBatch(productIds, dbQuery)

  const resolved = new Map()
  for (const row of rows) {
    const lock = lockByProductId.get(row.product_id)
    if (!lock) continue
    if (lock.quoteRequestSupplierId !== row.quote_request_supplier_id) continue
    if (lock.quoteResponseItemId !== row.quote_response_item_id) continue
    if (row.unit_price == null) continue

    const catalog = catalogMap.get(row.product_id)
    const defaultPrice = catalog?.amount ?? null
    const currency = row.currency || catalog?.currency || 'USD'

    resolved.set(
      row.product_id,
      buildQuoteResolution({
        unitPrice: Number(row.unit_price),
        currency,
        defaultPrice,
        quoteResponseItemId: row.quote_response_item_id,
      })
    )
  }

  return resolved
}

/**
 * Resolve unit price for a restaurant + supplier + product.
 * Precedence: active contract price (if min qty met) → default catalog price.
 * Uniqueness: DB enforces one row per (supplier, restaurant, product).
 *
 * @param {{
 *   restaurantId?: string | null,
 *   supplierId: string,
 *   productId: string,
 *   quantity?: number,
 *   date?: Date | string,
 * }} params
 * @param {Function} dbQuery
 */
export async function resolveProductPrice(
  { restaurantId, supplierId, productId, quantity = 1, date = new Date() },
  dbQuery = query
) {
  const catalog = await getDefaultCatalogPrice(productId, dbQuery)
  const defaultPrice = catalog?.amount ?? null
  const currency = catalog?.currency ?? 'USD'

  if (!restaurantId) {
    return buildDefaultResolution(defaultPrice, currency)
  }

  const asOf = toDateOnly(date)
  const dateStr = asOf.toISOString().slice(0, 10)

  const { rows } = await dbQuery(
    `
    SELECT *
    FROM restaurant_pricing
    WHERE restaurant_id = $1
      AND supplier_id = $2
      AND product_id = $3
      AND is_active = true
      AND (contract_start_date IS NULL OR contract_start_date <= $4::date)
      AND (contract_end_date IS NULL OR contract_end_date >= $4::date)
      AND (min_order_quantity IS NULL OR min_order_quantity <= $5)
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [restaurantId, supplierId, productId, dateStr, quantity]
  )

  if (rows.length) {
    const contract = rows[0]
    return {
      unitPrice: Number(contract.price),
      source: 'CONTRACT_PRICE',
      defaultPrice,
      contractPriceId: contract.id,
      quoteResponseItemId: null,
      discountPercent:
        contract.contract_discount_percentage != null
          ? Number(contract.contract_discount_percentage)
          : null,
      validFrom: contract.contract_start_date,
      validUntil: contract.contract_end_date,
      currency: contract.currency || currency,
      minOrderQuantity:
        contract.min_order_quantity != null ? Number(contract.min_order_quantity) : null,
    }
  }

  return buildDefaultResolution(defaultPrice, currency)
}

/**
 * Resolve prices for multiple line items (cart preview, catalog enrichment).
 * @param {{
 *   restaurantId: string,
 *   items: Array<{ productId: string, supplierId: string, quantity?: number }>,
 *   date?: Date | string,
 * }} params
 * @param {Function} dbQuery
 */
export async function resolveProductPricesBatch(
  { restaurantId, items, date = new Date(), catalogByProductId = null, quoteLocks = null },
  dbQuery = query
) {
  if (!items?.length) return []

  const productIds = [...new Set(items.map((i) => i.productId))]
  const catalogMap =
    catalogByProductId instanceof Map
      ? catalogByProductId
      : await getDefaultCatalogPricesBatch(productIds, dbQuery)

  const quoteByProductId = quoteLocks?.length
    ? await resolveQuotePricesBatch({ restaurantId, quoteLocks }, dbQuery)
    : new Map()

  const asOf = toDateOnly(date)
  const dateStr = asOf.toISOString().slice(0, 10)

  const pairs = items.map((i) => [i.supplierId, i.productId])
  const uniquePairs = [...new Map(pairs.map((p) => [p.join(':'), p])).values()]

  const supplierIds = [...new Set(uniquePairs.map((p) => p[0]))]
  const pairProductIds = [...new Set(uniquePairs.map((p) => p[1]))]

  const { rows: contracts } = await dbQuery(
    `
    SELECT
      id, supplier_id, product_id, price, currency,
      contract_discount_percentage, contract_start_date, contract_end_date,
      min_order_quantity, updated_at
    FROM restaurant_pricing
    WHERE restaurant_id = $1
      AND supplier_id = ANY($2::uuid[])
      AND product_id = ANY($3::uuid[])
      AND is_active = true
      AND (contract_start_date IS NULL OR contract_start_date <= $4::date)
      AND (contract_end_date IS NULL OR contract_end_date >= $4::date)
    ORDER BY updated_at DESC
    `,
    [restaurantId, supplierIds, pairProductIds, dateStr]
  )

  const contractByKey = new Map(contracts.map((c) => [`${c.supplier_id}:${c.product_id}`, c]))

  return items.map((item) => {
    const qty = item.quantity ?? 1
    const catalog = catalogMap.get(item.productId)
    const defaultPrice = catalog?.amount ?? null
    const currency = catalog?.currency ?? 'USD'
    const quoteResolved = quoteByProductId.get(item.productId)

    if (quoteResolved?.unitPrice != null) {
      return {
        productId: item.productId,
        supplierId: item.supplierId,
        quantity: qty,
        ...quoteResolved,
      }
    }

    const key = `${item.supplierId}:${item.productId}`
    const contract = contractByKey.get(key)

    if (
      contract &&
      (contract.min_order_quantity == null || Number(contract.min_order_quantity) <= qty)
    ) {
      return {
        productId: item.productId,
        supplierId: item.supplierId,
        quantity: qty,
        unitPrice: Number(contract.price),
        source: 'CONTRACT_PRICE',
        defaultPrice,
        contractPriceId: contract.id,
        quoteResponseItemId: null,
        discountPercent:
          contract.contract_discount_percentage != null
            ? Number(contract.contract_discount_percentage)
            : null,
        validFrom: contract.contract_start_date,
        validUntil: contract.contract_end_date,
        currency: contract.currency || currency,
        minOrderQuantity:
          contract.min_order_quantity != null ? Number(contract.min_order_quantity) : null,
      }
    }

    return {
      productId: item.productId,
      supplierId: item.supplierId,
      quantity: qty,
      ...buildDefaultResolution(defaultPrice, currency),
    }
  })
}

/**
 * Enrich product rows for restaurant catalog display.
 * @param {object[]} products
 * @param {string} restaurantId
 * @param {Function} dbQuery
 */
export async function enrichProductsWithResolvedPricing(products, restaurantId, dbQuery = query) {
  if (!restaurantId || !products?.length) return products

  const items = products.map((p) => ({
    productId: p.id,
    supplierId: p.supplier_id,
    quantity: 1,
  }))

  const resolved = await resolveProductPricesBatch({ restaurantId, items }, dbQuery)
  const byProductId = new Map(resolved.map((r) => [r.productId, r]))

  return products.map((p) => {
    const r = byProductId.get(p.id)
    if (!r) return p

    const catalogPrice =
      r.defaultPrice ?? (p.current_price != null ? Number(p.current_price) : null)

    return {
      ...p,
      catalog_price: catalogPrice,
      current_price: r.unitPrice ?? catalogPrice,
      pricing_source: r.source,
      contract_price_id: r.contractPriceId,
      contract_discount_percent: r.discountPercent,
      contract_valid_from: r.validFrom,
      contract_valid_until: r.validUntil,
      contract_min_order_quantity: r.minOrderQuantity,
    }
  })
}
