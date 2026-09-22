/**
 * Deterministic purchase-price intelligence for restaurants.
 *
 * Every number here is read back from data the tenant already owns —
 * `supplier_price_events` (written by the receiving/catalog/contract hooks in
 * recipe-purchasing-hooks.service.js) and the authoritative price resolver.
 * Nothing is modelled, extrapolated, or inferred; if the data cannot support a
 * statement, the statement is omitted rather than estimated.
 *
 * Entitlement (see lib/intelligence-tier.js):
 *   basic    — price history
 *   advanced — price-change and cheaper-buy alerts
 */
import { query } from '../lib/db.js'

/** Below this, a price move is rounding/packaging noise rather than a signal. */
const DEFAULT_MIN_CHANGE_PCT = 5
const DEFAULT_HISTORY_DAYS = 180
const DEFAULT_ALERT_DAYS = 30
const MAX_HISTORY_POINTS = 200

function toNumber(value) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function mapEvent(row) {
  const oldPrice = toNumber(row.old_price)
  const newPrice = toNumber(row.new_price)
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name ?? null,
    oldPrice,
    newPrice,
    // Recompute rather than trusting the stored column: `change_pct` is null on
    // the first observation and on rows written before it was populated.
    changePct:
      oldPrice != null && newPrice != null && oldPrice !== 0
        ? ((newPrice - oldPrice) / oldPrice) * 100
        : toNumber(row.change_pct),
    source: row.source,
    detectedAt: row.detected_at,
  }
}

/**
 * Observed price timeline for one product, newest first, plus a window summary.
 *
 * @param {string} restaurantId
 * @param {string} productId
 * @param {{ days?: number, limit?: number }} [opts]
 * @param {Function} [dbQuery]
 */
export async function getProductPriceHistory(restaurantId, productId, opts = {}, dbQuery = query) {
  if (!restaurantId || !productId) {
    throw new Error('restaurantId and productId are required')
  }
  const days = clampInt(opts.days, { min: 1, max: 730, fallback: DEFAULT_HISTORY_DAYS })
  const limit = clampInt(opts.limit, { min: 1, max: MAX_HISTORY_POINTS, fallback: 100 })

  const { rows } = await dbQuery(
    `
    SELECT spe.*, s.name AS supplier_name
    FROM supplier_price_events spe
    LEFT JOIN supplier s ON s.id = spe.supplier_id
    WHERE spe.restaurant_id = $1
      AND spe.product_id = $2
      AND spe.detected_at >= now() - ($3::int * INTERVAL '1 day')
    ORDER BY spe.detected_at DESC
    LIMIT $4
    `,
    [restaurantId, productId, days, limit]
  )

  const events = rows.map(mapEvent)
  const prices = events.map((e) => e.newPrice).filter((p) => p != null)

  // Oldest observation in the window is the baseline; `old_price` on that row
  // predates the window, so it is not part of the window's own range.
  const oldest = events[events.length - 1] ?? null
  const latest = events[0] ?? null
  const baseline = oldest?.oldPrice ?? oldest?.newPrice ?? null
  const current = latest?.newPrice ?? null

  return {
    productId,
    windowDays: days,
    events,
    summary: {
      observations: events.length,
      currentPrice: current,
      lowestPrice: prices.length ? Math.min(...prices) : null,
      highestPrice: prices.length ? Math.max(...prices) : null,
      averagePrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
      firstObservedPrice: baseline,
      changePct:
        baseline != null && current != null && baseline !== 0
          ? ((current - baseline) / baseline) * 100
          : null,
      // Only claim a direction when there is something to compare against.
      direction:
        baseline == null || current == null
          ? 'unknown'
          : current > baseline
            ? 'up'
            : current < baseline
              ? 'down'
              : 'flat',
      lastChangedAt: latest?.detectedAt ?? null,
    },
  }
}

/**
 * Meaningful supplier price movements in the window, largest increase first.
 *
 * @param {string} restaurantId
 * @param {{ days?: number, minChangePct?: number, limit?: number, direction?: 'up'|'down'|'any' }} [opts]
 * @param {Function} [dbQuery]
 */
export async function listPriceChangeAlerts(restaurantId, opts = {}, dbQuery = query) {
  if (!restaurantId) throw new Error('restaurantId is required')

  const days = clampInt(opts.days, { min: 1, max: 365, fallback: DEFAULT_ALERT_DAYS })
  const limit = clampInt(opts.limit, { min: 1, max: 100, fallback: 25 })
  const minChangePct = Number.isFinite(Number(opts.minChangePct))
    ? Math.abs(Number(opts.minChangePct))
    : DEFAULT_MIN_CHANGE_PCT
  const direction = ['up', 'down', 'any'].includes(opts.direction) ? opts.direction : 'up'

  const { rows } = await dbQuery(
    `
    SELECT spe.*, s.name AS supplier_name
    FROM supplier_price_events spe
    LEFT JOIN supplier s ON s.id = spe.supplier_id
    WHERE spe.restaurant_id = $1
      AND spe.detected_at >= now() - ($2::int * INTERVAL '1 day')
      AND spe.old_price IS NOT NULL
      AND spe.old_price <> 0
      AND ABS((spe.new_price - spe.old_price) / spe.old_price) * 100 >= $3
      AND (
        $4 = 'any'
        OR ($4 = 'up' AND spe.new_price > spe.old_price)
        OR ($4 = 'down' AND spe.new_price < spe.old_price)
      )
    ORDER BY ABS((spe.new_price - spe.old_price) / spe.old_price) DESC, spe.detected_at DESC
    LIMIT $5
    `,
    [restaurantId, days, minChangePct, direction, limit]
  )

  return {
    windowDays: days,
    minChangePct,
    direction,
    alerts: rows.map((row) => {
      const event = mapEvent(row)
      return {
        ...event,
        severity: Math.abs(event.changePct ?? 0) >= minChangePct * 2 ? 'high' : 'medium',
      }
    }),
  }
}

/**
 * Cheaper options for products whose price rose, from authorised data only.
 *
 * Two sources, both explicit — neither infers that two catalog rows are "the
 * same product":
 *   1. `product_substitute` — the supplier's own declared alternatives.
 *   2. The restaurant's active contract price on the same product, when the
 *      latest observed price is above it.
 *
 * Cross-supplier matching is deliberately absent: `product.sku` is unique per
 * supplier and there is no GTIN/barcode column, so equating two suppliers'
 * catalog rows would be a guess. See docs/features/operational-intelligence.md.
 */
export async function listCheaperBuyOptions(restaurantId, opts = {}, dbQuery = query) {
  if (!restaurantId) throw new Error('restaurantId is required')

  const days = clampInt(opts.days, { min: 1, max: 365, fallback: DEFAULT_ALERT_DAYS })
  const limit = clampInt(opts.limit, { min: 1, max: 50, fallback: 20 })
  const minChangePct = Number.isFinite(Number(opts.minChangePct))
    ? Math.abs(Number(opts.minChangePct))
    : DEFAULT_MIN_CHANGE_PCT

  const { rows } = await dbQuery(
    `
    WITH latest_event AS (
      SELECT DISTINCT ON (spe.product_id)
        spe.product_id, spe.supplier_id, spe.product_name,
        spe.old_price, spe.new_price, spe.detected_at
      FROM supplier_price_events spe
      WHERE spe.restaurant_id = $1
        AND spe.detected_at >= now() - ($2::int * INTERVAL '1 day')
      ORDER BY spe.product_id, spe.detected_at DESC
    ),
    risen AS (
      SELECT *
      FROM latest_event
      WHERE old_price IS NOT NULL
        AND old_price <> 0
        AND new_price > old_price
        AND ((new_price - old_price) / old_price) * 100 >= $3
    )
    SELECT
      r.product_id,
      r.product_name,
      r.supplier_id,
      r.old_price,
      r.new_price,
      r.detected_at,
      s.name AS supplier_name,
      contract.price AS contract_price,
      sub.substitute_product_id,
      sub_product.name AS substitute_product_name,
      sub_price.amount AS substitute_price
    FROM risen r
    LEFT JOIN supplier s ON s.id = r.supplier_id
    LEFT JOIN LATERAL (
      SELECT rp.price
      FROM restaurant_pricing rp
      WHERE rp.restaurant_id = $1
        AND rp.product_id = r.product_id
        AND rp.supplier_id = r.supplier_id
        AND rp.is_active = true
        AND (rp.contract_start_date IS NULL OR rp.contract_start_date <= CURRENT_DATE)
        AND (rp.contract_end_date IS NULL OR rp.contract_end_date >= CURRENT_DATE)
      ORDER BY rp.updated_at DESC
      LIMIT 1
    ) contract ON true
    LEFT JOIN LATERAL (
      SELECT ps.substitute_product_id
      FROM product_substitute ps
      WHERE ps.product_id = r.product_id
        AND ps.supplier_id = r.supplier_id
      ORDER BY ps.priority ASC
      LIMIT 1
    ) sub ON true
    LEFT JOIN product sub_product ON sub_product.id = sub.substitute_product_id
    LEFT JOIN LATERAL (
      -- Same validity rule as getDefaultCatalogPrice, so a substitute is only
      -- quoted at a price that is actually sellable right now.
      SELECT p.amount
      FROM price p
      WHERE p.product_id = sub.substitute_product_id
        AND (p.valid_to IS NULL OR now() BETWEEN p.valid_from AND p.valid_to)
      ORDER BY p.valid_from DESC
      LIMIT 1
    ) sub_price ON true
    ORDER BY ((r.new_price - r.old_price) / r.old_price) DESC
    LIMIT $4
    `,
    [restaurantId, days, minChangePct, limit]
  )

  const options = []
  for (const row of rows) {
    const currentPrice = toNumber(row.new_price)
    if (currentPrice == null) continue

    const alternatives = []

    const contractPrice = toNumber(row.contract_price)
    if (contractPrice != null && contractPrice < currentPrice) {
      alternatives.push({
        kind: 'contract_price',
        supplierId: row.supplier_id,
        supplierName: row.supplier_name ?? null,
        productId: row.product_id,
        productName: row.product_name,
        price: contractPrice,
        savingPerUnit: currentPrice - contractPrice,
        // The contract is already agreed; paying above it is the anomaly.
        reason: 'An active contract price for this product is lower than the price last observed',
      })
    }

    const substitutePrice = toNumber(row.substitute_price)
    if (row.substitute_product_id && substitutePrice != null && substitutePrice < currentPrice) {
      alternatives.push({
        kind: 'supplier_substitute',
        supplierId: row.supplier_id,
        supplierName: row.supplier_name ?? null,
        productId: row.substitute_product_id,
        productName: row.substitute_product_name,
        price: substitutePrice,
        savingPerUnit: currentPrice - substitutePrice,
        reason: 'The supplier lists this as an approved substitute at a lower price',
      })
    }

    if (!alternatives.length) continue

    options.push({
      productId: row.product_id,
      productName: row.product_name,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name ?? null,
      previousPrice: toNumber(row.old_price),
      currentPrice,
      detectedAt: row.detected_at,
      alternatives: alternatives.sort((a, b) => b.savingPerUnit - a.savingPerUnit),
    })
  }

  return { windowDays: days, minChangePct, options }
}
