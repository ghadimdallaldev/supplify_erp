/**
 * Batched helpers for restaurant order creation (transaction-safe).
 */

export async function insertOrderItemsBatch(client, orderId, supplierId, items) {
  if (!items.length) return []

  const productIds = []
  const quantities = []
  const unitPrices = []
  const lineTotals = []
  const notes = []
  const pricingSources = []
  const contractPriceIds = []
  const defaultCatalogPrices = []
  const quoteResponseItemIds = []

  for (const item of items) {
    productIds.push(item.productId)
    quantities.push(item.quantity)
    unitPrices.push(item.unitPrice)
    lineTotals.push(item.unitPrice * item.quantity)
    notes.push(item.notes ?? null)
    pricingSources.push(item.pricingSource || 'DEFAULT_PRICE')
    contractPriceIds.push(item.contractPriceId || null)
    defaultCatalogPrices.push(item.defaultCatalogPrice ?? null)
    quoteResponseItemIds.push(item.quoteResponseItemId || null)
  }

  const { rows } = await client.query(
    `
    INSERT INTO order_item (
      order_id, product_id, supplier_id, quantity, unit_price, line_total, notes,
      pricing_source, contract_price_id, default_catalog_price, quote_response_item_id
    )
    SELECT
      $1,
      v.product_id,
      $2,
      v.quantity,
      v.unit_price,
      v.line_total,
      v.notes,
      v.pricing_source,
      v.contract_price_id,
      v.default_catalog_price,
      v.quote_response_item_id
    FROM unnest(
      $3::uuid[],
      $4::numeric[],
      $5::numeric[],
      $6::numeric[],
      $7::text[],
      $8::text[],
      $9::uuid[],
      $10::numeric[],
      $11::uuid[]
    ) AS v(
      product_id,
      quantity,
      unit_price,
      line_total,
      notes,
      pricing_source,
      contract_price_id,
      default_catalog_price,
      quote_response_item_id
    )
    RETURNING *
    `,
    [
      orderId,
      supplierId,
      productIds,
      quantities,
      unitPrices,
      lineTotals,
      notes,
      pricingSources,
      contractPriceIds,
      defaultCatalogPrices,
      quoteResponseItemIds,
    ]
  )

  return rows
}
