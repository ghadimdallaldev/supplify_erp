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
import { getDefaultTenantTimezone } from '../lib/tenant-timezone.js'

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
    currency: row.currency || null,
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
    WITH window_events AS (
      SELECT spe.*, s.name AS supplier_name
      FROM supplier_price_events spe
      LEFT JOIN supplier s ON s.id = spe.supplier_id
      WHERE spe.restaurant_id = $1
        AND spe.product_id = $2
        AND spe.detected_at >= now() - ($3::int * INTERVAL '1 day')
    ),
    latest_currency AS (
      SELECT currency
      FROM window_events
      ORDER BY detected_at DESC
      LIMIT 1
    ),
    comparable AS (
      SELECT we.*
      FROM window_events we
      LEFT JOIN latest_currency lc ON true
      WHERE we.currency IS NULL
        OR lc.currency IS NULL
        OR upper(we.currency) = upper(lc.currency)
    ),
    stats AS (
      SELECT
        COUNT(*)::int AS observation_count,
        MIN(new_price) AS lowest_price,
        MAX(new_price) AS highest_price,
        AVG(new_price) AS average_price,
        (ARRAY_AGG(new_price ORDER BY detected_at DESC))[1] AS current_price,
        (ARRAY_AGG(COALESCE(old_price, new_price) ORDER BY detected_at ASC))[1] AS first_observed_price,
        (ARRAY_AGG(detected_at ORDER BY detected_at DESC))[1] AS last_changed_at
      FROM comparable
    )
    SELECT we.*, st.observation_count, st.lowest_price, st.highest_price, st.average_price,
           st.current_price, st.first_observed_price, st.last_changed_at
    FROM comparable we
    CROSS JOIN stats st
    ORDER BY we.detected_at DESC
    LIMIT $4
    `,
    [restaurantId, productId, days, limit]
  )

  const events = rows.map(mapEvent)
  const prices = events.map((e) => e.newPrice).filter((p) => p != null)

  // Oldest observation in the returned page is the baseline when the query did
  // not include window-wide stats (tests and older callers).
  const oldest = events[events.length - 1] ?? null
  const latest = events[0] ?? null
  const pageBaseline = oldest?.oldPrice ?? oldest?.newPrice ?? null
  const pageCurrent = latest?.newPrice ?? null
  const windowStats = rows[0]?.observation_count != null
  const baseline = windowStats ? toNumber(rows[0].first_observed_price) : pageBaseline
  const current = windowStats ? toNumber(rows[0].current_price) : pageCurrent

  return {
    productId,
    windowDays: days,
    events,
    summary: {
      observations: windowStats ? Number(rows[0].observation_count) : events.length,
      currentPrice: current,
      lowestPrice: windowStats
        ? toNumber(rows[0].lowest_price)
        : prices.length
          ? Math.min(...prices)
          : null,
      highestPrice: windowStats
        ? toNumber(rows[0].highest_price)
        : prices.length
          ? Math.max(...prices)
          : null,
      averagePrice: windowStats
        ? toNumber(rows[0].average_price)
        : prices.length
          ? prices.reduce((a, b) => a + b, 0) / prices.length
          : null,
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
      lastChangedAt: windowStats ? (rows[0].last_changed_at ?? null) : (latest?.detectedAt ?? null),
      currency: latest?.currency ?? null,
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
    WITH restaurant_today AS (
      SELECT (now() AT TIME ZONE COALESCE(
        (SELECT NULLIF(TRIM(timezone), '') FROM restaurant WHERE id = $1),
        $5
      ))::date AS today
    ),
    latest_event AS (
      SELECT DISTINCT ON (spe.product_id)
        spe.product_id, spe.supplier_id, spe.product_name,
        spe.old_price, spe.new_price, spe.detected_at, spe.currency
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
      sub.substitute_price AS substitute_price
    FROM risen r
    LEFT JOIN supplier s ON s.id = r.supplier_id
    LEFT JOIN LATERAL (
      SELECT co.currency
      FROM order_item oi
      JOIN customer_order co ON co.id = oi.order_id
      WHERE co.restaurant_id = $1
        AND oi.product_id = r.product_id
        AND (r.supplier_id IS NULL OR oi.supplier_id = r.supplier_id)
        AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      ORDER BY co.placed_at DESC NULLS LAST
      LIMIT 1
    ) observed ON true
    LEFT JOIN LATERAL (
      SELECT rp.price, rp.currency AS contract_currency
      FROM restaurant_pricing rp
      WHERE rp.restaurant_id = $1
        AND rp.product_id = r.product_id
        AND rp.supplier_id = r.supplier_id
        AND rp.is_active = true
        AND (rp.contract_start_date IS NULL OR rp.contract_start_date <= (SELECT today FROM restaurant_today))
        AND (rp.contract_end_date IS NULL OR rp.contract_end_date >= (SELECT today FROM restaurant_today))
        AND (rp.min_order_quantity IS NULL OR rp.min_order_quantity <= 1)
        AND (
          observed.currency IS NULL
          OR rp.currency IS NULL
          OR upper(rp.currency) = upper(observed.currency)
        )
      ORDER BY rp.updated_at DESC
      LIMIT 1
    ) contract ON true
    LEFT JOIN LATERAL (
      SELECT ps.substitute_product_id, sp.amount AS substitute_price, sp.currency AS substitute_currency
      FROM product_substitute ps
      JOIN LATERAL (
        SELECT p.amount, p.currency
        FROM price p
        WHERE p.product_id = ps.substitute_product_id
          AND p.valid_from <= now()
          AND (p.valid_to IS NULL OR p.valid_to >= now())
          AND (
            observed.currency IS NULL
            OR p.currency IS NULL
            OR upper(p.currency) = upper(observed.currency)
          )
        ORDER BY (CASE WHEN p.min_qty <= 1 THEN 0 ELSE 1 END), p.valid_from DESC
        LIMIT 1
      ) sp ON sp.amount < r.new_price
      WHERE ps.product_id = r.product_id
        AND ps.supplier_id = r.supplier_id
      ORDER BY sp.amount ASC, ps.priority ASC
      LIMIT 1
    ) sub ON true
    LEFT JOIN product sub_product ON sub_product.id = sub.substitute_product_id
    WHERE (
      (contract.price IS NOT NULL AND contract.price < r.new_price)
      OR sub.substitute_product_id IS NOT NULL
    )
    AND (
      r.currency IS NULL
      OR observed.currency IS NULL
      OR upper(r.currency) = upper(observed.currency)
    )
    ORDER BY GREATEST(
      CASE WHEN contract.price IS NOT NULL AND contract.price < r.new_price
        THEN (r.new_price - contract.price) ELSE 0 END,
      CASE WHEN sub.substitute_price IS NOT NULL
        THEN (r.new_price - sub.substitute_price) ELSE 0 END
    ) DESC
    LIMIT $4
    `,
    [restaurantId, days, minChangePct, limit, getDefaultTenantTimezone()]
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
        currency: row.contract_currency || row.currency || null,
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
        currency: row.substitute_currency || row.currency || null,
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
      currency: row.currency || null,
      previousPrice: toNumber(row.old_price),
      currentPrice,
      detectedAt: row.detected_at,
      alternatives: alternatives.sort((a, b) => b.savingPerUnit - a.savingPerUnit),
    })
  }

  return { windowDays: days, minChangePct, options }
}
