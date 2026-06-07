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
    discountPercent: null,
    validFrom: null,
    validUntil: null,
    currency,
    minOrderQuantity: null,
  }
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
  { restaurantId, items, date = new Date(), catalogByProductId = null },
  dbQuery = query
) {
  if (!items?.length) return []

  const productIds = [...new Set(items.map((i) => i.productId))]
  const catalogMap =
    catalogByProductId instanceof Map
      ? catalogByProductId
      : await getDefaultCatalogPricesBatch(productIds, dbQuery)

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
