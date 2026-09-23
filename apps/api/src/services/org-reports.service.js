/**
 * Org-scoped consolidated reporting.
 * Authorized Branch Account IDs are always derived server-side — never trust client lists.
 */
import { query } from '../lib/db.js'
import { parseReportQuery, MAX_REPORT_RANGE_DAYS } from './reports.service.js'
import { listRestaurantOrgBranchesForUser } from '../lib/restaurant-org.js'
import { listOrgBranchesForUser } from '../lib/supplier-org.js'
import { ValidationError } from '../middlewares/errorHandler.js'

const PAGE_DEFAULT = 50
const PAGE_MAX = 200

function parsePagination(queryParams = {}) {
  const limit = Math.min(
    PAGE_MAX,
    Math.max(1, parseInt(String(queryParams.limit || PAGE_DEFAULT), 10) || PAGE_DEFAULT)
  )
  const offset = Math.max(0, parseInt(String(queryParams.offset || 0), 10) || 0)
  return { limit, offset }
}

/**
 * Resolve Branch Account IDs the user may report on within the org.
 * Optional `branchIds` query filter is intersected with authorized IDs (never trusted alone).
 */
export async function resolveAuthorizedRestaurantBranchIds(
  userId,
  organizationId,
  requestedBranchIds = null
) {
  const branches = await listRestaurantOrgBranchesForUser(userId, organizationId)
  const authorized = branches.filter((b) => b.is_branch_active !== false).map((b) => b.id)
  if (!requestedBranchIds?.length) return authorized
  const requested = new Set(requestedBranchIds.filter(Boolean))
  return authorized.filter((id) => requested.has(id))
}

export async function resolveAuthorizedSupplierBranchIds(
  userId,
  organizationId,
  requestedBranchIds = null
) {
  const branches = await listOrgBranchesForUser(userId, organizationId)
  const authorized = branches.filter((b) => b.is_branch_active !== false).map((b) => b.id)
  if (!requestedBranchIds?.length) return authorized
  const requested = new Set(requestedBranchIds.filter(Boolean))
  return authorized.filter((id) => requested.has(id))
}

function parseRequestedBranchIds(queryParams = {}) {
  const raw = queryParams.branch_ids || queryParams.branchIds || queryParams.tenant_ids
  if (!raw) return null
  if (Array.isArray(raw)) return raw.map(String)
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function restaurantOrgConsolidatedOverview(userId, organizationId, queryParams = {}) {
  const params = parseReportQuery(queryParams)
  const { limit, offset } = parsePagination(queryParams)
  const requested = parseRequestedBranchIds(queryParams)
  const branchIds = await resolveAuthorizedRestaurantBranchIds(userId, organizationId, requested)

  if (!branchIds.length) {
    return {
      data: {
        kpis: { order_count: 0, total_spend: 0, active_branch_accounts: 0 },
        by_branch: [],
      },
      meta: {
        from: params.from.toISOString().slice(0, 10),
        to: params.to.toISOString().slice(0, 10),
        branchAccountIds: [],
        limit,
        offset,
        maxRangeDays: MAX_REPORT_RANGE_DAYS,
      },
    }
  }

  const { rows: kpiRows } = await query(
    `
    SELECT
      COUNT(DISTINCT co.id)::int AS order_count,
      COALESCE(SUM(co.total_amount), 0)::numeric AS total_spend
    FROM customer_order co
    WHERE co.restaurant_id = ANY($1::uuid[])
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    `,
    [branchIds, params.from, params.to]
  )

  const { rows: byBranch } = await query(
    `
    SELECT
      r.id AS branch_account_id,
      r.name AS branch_account_name,
      r.is_main_branch,
      COUNT(DISTINCT co.id)::int AS order_count,
      COALESCE(SUM(co.total_amount), 0)::numeric AS total_spend
    FROM restaurant r
    LEFT JOIN customer_order co
      ON co.restaurant_id = r.id
     AND co.placed_at >= $2
     AND co.placed_at <= $3
     AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    WHERE r.id = ANY($1::uuid[])
    GROUP BY r.id, r.name, r.is_main_branch
    ORDER BY total_spend DESC, r.name ASC
    LIMIT $4 OFFSET $5
    `,
    [branchIds, params.from, params.to, limit, offset]
  )

  return {
    data: {
      kpis: {
        order_count: Number(kpiRows[0]?.order_count || 0),
        total_spend: Number(kpiRows[0]?.total_spend || 0),
        active_branch_accounts: branchIds.length,
      },
      by_branch: byBranch,
    },
    meta: {
      from: params.from.toISOString().slice(0, 10),
      to: params.to.toISOString().slice(0, 10),
      branchAccountIds: branchIds,
      limit,
      offset,
      rowCount: byBranch.length,
      maxRangeDays: MAX_REPORT_RANGE_DAYS,
    },
  }
}

/** Read-only comparison of stored, branch-account facts. Food cost is excluded:
 * separate restaurant tenants do not have a shared recipe/menu identity. */
export async function restaurantOrgBranchComparison(userId, organizationId, queryParams = {}) {
  const params = parseReportQuery(queryParams)
  const requested = parseRequestedBranchIds(queryParams)
  const branchIds = await resolveAuthorizedRestaurantBranchIds(userId, organizationId, requested)
  if (!branchIds.length)
    return {
      data: {
        branches: [],
        coverage: { foodCost: { available: false, reason: 'no_shared_recipe_identity_model' } },
      },
      meta: {
        from: params.from.toISOString().slice(0, 10),
        to: params.to.toISOString().slice(0, 10),
        branchAccountIds: [],
      },
    }
  const durationMs = params.to.getTime() - params.from.getTime()
  const previousFrom = new Date(params.from.getTime() - durationMs)
  const { rows } = await query(
    `
    WITH orders AS (
      SELECT restaurant_id,
        COUNT(*) FILTER (WHERE placed_at >= $2 AND placed_at <= $3)::int AS order_count,
        COALESCE(SUM(total_amount) FILTER (WHERE placed_at >= $2 AND placed_at <= $3), 0)::numeric AS spend,
        COALESCE(SUM(total_amount) FILTER (WHERE placed_at >= $4 AND placed_at < $2), 0)::numeric AS previous_spend
      FROM customer_order WHERE restaurant_id = ANY($1::uuid[]) AND status NOT IN ('DRAFT','CANCELLED','PENDING_APPROVAL') GROUP BY restaurant_id
    ), inventory AS (
      SELECT restaurant_id, COUNT(*)::int AS tracked_products,
        COUNT(*) FILTER (WHERE quantity <= 0)::int AS out_of_stock_products,
        COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= COALESCE(low_stock_threshold, 0))::int AS low_stock_products
      FROM restaurant_inventory WHERE restaurant_id = ANY($1::uuid[]) GROUP BY restaurant_id
    ), waste AS (
      SELECT restaurant_id, COUNT(*)::int AS incidents, COALESCE(SUM(COALESCE(total_cost, unit_cost * quantity)),0)::numeric AS cost
      FROM inventory_adjustment WHERE restaurant_id = ANY($1::uuid[]) AND adjustment_type IN ('WASTAGE','SPOILAGE') AND created_at >= $2 AND created_at <= $3 GROUP BY restaurant_id
    ), receiving AS (
      SELECT restaurant_id, COUNT(*)::int AS reports,
        AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL) AS average_quality_score,
        CASE WHEN SUM(total_items_ordered) > 0 THEN SUM(total_items_received) / SUM(total_items_ordered) * 100 ELSE NULL END AS fill_rate_pct
      FROM receiving_report WHERE restaurant_id = ANY($1::uuid[]) AND received_at >= $2 AND received_at <= $3 GROUP BY restaurant_id
    )
    SELECT r.id AS branch_account_id, r.name AS branch_account_name, r.is_main_branch,
      COALESCE(o.order_count,0) AS order_count, COALESCE(o.spend,0) AS spend, COALESCE(o.previous_spend,0) AS previous_spend,
      COALESCE(i.tracked_products,0) AS tracked_products, COALESCE(i.out_of_stock_products,0) AS out_of_stock_products, COALESCE(i.low_stock_products,0) AS low_stock_products,
      COALESCE(w.incidents,0) AS waste_incidents, COALESCE(w.cost,0) AS waste_cost,
      COALESCE(rc.reports,0) AS receiving_reports, rc.average_quality_score, rc.fill_rate_pct
    FROM restaurant r LEFT JOIN orders o ON o.restaurant_id=r.id LEFT JOIN inventory i ON i.restaurant_id=r.id LEFT JOIN waste w ON w.restaurant_id=r.id LEFT JOIN receiving rc ON rc.restaurant_id=r.id
    WHERE r.id = ANY($1::uuid[]) ORDER BY spend DESC, r.name ASC`,
    [branchIds, params.from, params.to, previousFrom]
  )
  return {
    data: {
      branches: rows.map((r) => ({
        branchAccountId: r.branch_account_id,
        branchAccountName: r.branch_account_name,
        isMainBranch: r.is_main_branch,
        purchasing: {
          orderCount: Number(r.order_count),
          spend: Number(r.spend),
          previousSpend: Number(r.previous_spend),
        },
        inventory: {
          trackedProducts: Number(r.tracked_products),
          outOfStockProducts: Number(r.out_of_stock_products),
          lowStockProducts: Number(r.low_stock_products),
        },
        waste: { incidents: Number(r.waste_incidents), cost: Number(r.waste_cost) },
        supplierPerformance: {
          receivingReports: Number(r.receiving_reports),
          averageQualityScore:
            r.average_quality_score == null ? null : Number(r.average_quality_score),
          fillRatePct: r.fill_rate_pct == null ? null : Number(r.fill_rate_pct),
        },
      })),
      coverage: { foodCost: { available: false, reason: 'no_shared_recipe_identity_model' } },
    },
    meta: {
      from: params.from.toISOString().slice(0, 10),
      to: params.to.toISOString().slice(0, 10),
      branchAccountIds: branchIds,
    },
  }
}
/**
 * Read-only Branch-Account view of the existing deterministic forecast cache.
 * Only restaurant-wide cache rows are comparable here; legacy intra-tenant
 * branch rows are deliberately excluded.
 */
export async function restaurantOrgBranchDemandForecast(userId, organizationId, queryParams = {}) {
  const requested = parseRequestedBranchIds(queryParams)
  const branchIds = await resolveAuthorizedRestaurantBranchIds(userId, organizationId, requested)
  const meta = { branchAccountIds: branchIds, forecastsPerBranch: 8, staleForecastsExcluded: true }
  if (!branchIds.length) {
    return {
      data: {
        branches: [],
        coverage: { scope: 'restaurant_account_aggregate_only', source: 'cached_reorder_forecast' },
      },
      meta,
    }
  }

  const { rows } = await query(
    `
    WITH fresh_forecasts AS (
      SELECT
        rf.restaurant_id,
        rf.product_id,
        p.name AS product_name,
        p.unit AS product_unit,
        rf.forecast_daily_usage,
        rf.forecast_reorder_qty,
        rf.reorder_by_date,
        rf.confidence,
        rf.urgency,
        rf.computed_at,
        COUNT(*) OVER (PARTITION BY rf.restaurant_id)::int AS forecast_count,
        COUNT(*) FILTER (WHERE rf.urgency IN ('URGENT', 'HIGH')) OVER (PARTITION BY rf.restaurant_id)::int AS high_or_urgent_count,
        MAX(rf.computed_at) OVER (PARTITION BY rf.restaurant_id) AS latest_computed_at,
        ROW_NUMBER() OVER (
          PARTITION BY rf.restaurant_id
          ORDER BY CASE rf.urgency WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                   rf.confidence DESC,
                   p.name ASC
        ) AS forecast_rank
      FROM reorder_forecast rf
      JOIN product p ON p.id = rf.product_id
      WHERE rf.restaurant_id = ANY($1::uuid[])
        AND rf.branch_id IS NULL
        AND rf.stale_after > now()
    )
    SELECT
      r.id AS branch_account_id,
      r.name AS branch_account_name,
      r.is_main_branch,
      f.product_id,
      f.product_name,
      f.product_unit,
      f.forecast_daily_usage,
      f.forecast_reorder_qty,
      f.reorder_by_date,
      f.confidence,
      f.urgency,
      f.computed_at,
      f.forecast_count,
      f.high_or_urgent_count,
      f.latest_computed_at
    FROM restaurant r
    LEFT JOIN fresh_forecasts f
      ON f.restaurant_id = r.id
     AND f.forecast_rank <= $2
    WHERE r.id = ANY($1::uuid[])
    ORDER BY r.name ASC, f.forecast_rank ASC
    `,
    [branchIds, meta.forecastsPerBranch]
  )

  const branches = new Map()
  for (const row of rows) {
    const id = row.branch_account_id
    if (!branches.has(id)) {
      branches.set(id, {
        branchAccountId: id,
        branchAccountName: row.branch_account_name,
        isMainBranch: row.is_main_branch,
        coverage: {
          freshForecasts: Number(row.forecast_count || 0),
          highOrUrgentForecasts: Number(row.high_or_urgent_count || 0),
          latestComputedAt: row.latest_computed_at || null,
        },
        forecasts: [],
      })
    }
    if (!row.product_id) continue
    branches.get(id).forecasts.push({
      productId: row.product_id,
      productName: row.product_name,
      productUnit: row.product_unit,
      forecastDailyUsage:
        row.forecast_daily_usage == null ? null : Number(row.forecast_daily_usage),
      forecastReorderQty:
        row.forecast_reorder_qty == null ? null : Number(row.forecast_reorder_qty),
      reorderByDate: row.reorder_by_date,
      confidence: Number(row.confidence),
      urgency: row.urgency,
      computedAt: row.computed_at,
    })
  }

  return {
    data: {
      branches: [...branches.values()],
      coverage: { scope: 'restaurant_account_aggregate_only', source: 'cached_reorder_forecast' },
    },
    meta,
  }
}
/**
 * Factual cross-Branch-Account purchase-price ranges. A row is comparable only
 * when it is the same catalog product from the same supplier; no product
 * matching, preferred supplier, or procurement action is inferred.
 */
export async function restaurantOrgCrossBranchPurchasingInsights(
  userId,
  organizationId,
  queryParams = {}
) {
  const params = parseReportQuery(queryParams)
  const requested = parseRequestedBranchIds(queryParams)
  const branchIds = await resolveAuthorizedRestaurantBranchIds(userId, organizationId, requested)
  const meta = {
    from: params.from.toISOString().slice(0, 10),
    to: params.to.toISOString().slice(0, 10),
    branchAccountIds: branchIds,
    maxSignals: 20,
  }
  if (!branchIds.length) {
    return {
      data: {
        signals: [],
        coverage: {
          source: 'latest_order_line_price_snapshots',
          comparableOnly: 'same_product_and_supplier',
        },
      },
      meta,
    }
  }

  const { rows } = await query(
    `
    WITH recent_lines AS (
      SELECT
        co.restaurant_id,
        r.name AS branch_account_name,
        oi.product_id,
        p.name AS product_name,
        p.unit AS product_unit,
        oi.supplier_id,
        s.name AS supplier_name,
        oi.unit_price,
        co.placed_at,
        ROW_NUMBER() OVER (
          PARTITION BY co.restaurant_id, oi.product_id, oi.supplier_id
          ORDER BY co.placed_at DESC, oi.id DESC
        ) AS branch_price_rank
      FROM customer_order co
      JOIN order_item oi ON oi.order_id = co.id
      JOIN restaurant r ON r.id = co.restaurant_id
      JOIN product p ON p.id = oi.product_id
      LEFT JOIN supplier s ON s.id = oi.supplier_id
      WHERE co.restaurant_id = ANY($1::uuid[])
        AND co.placed_at >= $2
        AND co.placed_at <= $3
        AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
        AND oi.unit_price IS NOT NULL
        AND oi.unit_price > 0
    ), latest_branch_prices AS (
      SELECT * FROM recent_lines WHERE branch_price_rank = 1
    ), comparable AS (
      SELECT
        product_id,
        product_name,
        product_unit,
        supplier_id,
        supplier_name,
        COUNT(*)::int AS branch_count,
        MIN(unit_price)::numeric AS min_unit_price,
        MAX(unit_price)::numeric AS max_unit_price,
        MAX(placed_at) AS latest_purchase_at,
        jsonb_agg(
          jsonb_build_object(
            'branchAccountName', branch_account_name,
            'unitPrice', unit_price,
            'purchasedAt', placed_at
          ) ORDER BY unit_price ASC, branch_account_name ASC
        ) AS branch_prices
      FROM latest_branch_prices
      GROUP BY product_id, product_name, product_unit, supplier_id, supplier_name
      HAVING COUNT(*) >= 2 AND MIN(unit_price) <> MAX(unit_price)
    )
    SELECT *,
      ((max_unit_price - min_unit_price) / NULLIF(min_unit_price, 0) * 100)::numeric AS price_spread_pct
    FROM comparable
    ORDER BY price_spread_pct DESC, latest_purchase_at DESC
    LIMIT $4
    `,
    [branchIds, params.from, params.to, meta.maxSignals]
  )

  return {
    data: {
      signals: rows.map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        productUnit: row.product_unit,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name ?? null,
        branchCount: Number(row.branch_count),
        minUnitPrice: Number(row.min_unit_price),
        maxUnitPrice: Number(row.max_unit_price),
        priceSpreadPct: Number(row.price_spread_pct),
        latestPurchaseAt: row.latest_purchase_at,
        branchPrices: row.branch_prices || [],
      })),
      coverage: {
        source: 'latest_order_line_price_snapshots',
        comparableOnly: 'same_product_and_supplier',
      },
    },
    meta,
  }
}
/** Recommendation-only transfer hints using an exact shared product identity.
 * They never reserve, move, or adjust inventory. */
export async function restaurantOrgStockTransferSuggestions(
  userId,
  organizationId,
  queryParams = {}
) {
  const requested = parseRequestedBranchIds(queryParams)
  const branchIds = await resolveAuthorizedRestaurantBranchIds(userId, organizationId, requested)
  const meta = { branchAccountIds: branchIds, maxSuggestions: 20, source: 'fresh_reorder_forecast' }
  if (!branchIds.length) return { data: { suggestions: [] }, meta }
  const { rows } = await query(
    `
    WITH recipients AS (
      SELECT rf.restaurant_id AS destination_restaurant_id, rf.product_id,
        rf.forecast_reorder_qty, rf.urgency, p.name AS product_name, p.unit AS product_unit
      FROM reorder_forecast rf
      JOIN product p ON p.id = rf.product_id
      WHERE rf.restaurant_id = ANY($1::uuid[]) AND rf.branch_id IS NULL
        AND rf.stale_after > now() AND rf.urgency IN ('URGENT','HIGH')
        AND rf.forecast_reorder_qty IS NOT NULL AND rf.forecast_reorder_qty > 0
    ), ranked AS (
      SELECT r.destination_restaurant_id, dest.name AS destination_branch_account_name,
        donor.id AS source_restaurant_id, donor.name AS source_branch_account_name,
        r.product_id, r.product_name, r.product_unit, r.urgency,
        di.quantity - di.low_stock_threshold AS source_surplus_qty,
        r.forecast_reorder_qty,
        LEAST(di.quantity - di.low_stock_threshold, r.forecast_reorder_qty) AS suggested_qty,
        ROW_NUMBER() OVER (
          PARTITION BY r.destination_restaurant_id, r.product_id
          ORDER BY (di.quantity - di.low_stock_threshold) DESC, donor.name ASC
        ) AS donor_rank
      FROM recipients r
      JOIN restaurant dest ON dest.id = r.destination_restaurant_id
      JOIN restaurant_inventory di ON di.product_id = r.product_id
      JOIN restaurant donor ON donor.id = di.restaurant_id
      WHERE di.restaurant_id = ANY($1::uuid[]) AND di.restaurant_id <> r.destination_restaurant_id
        AND di.low_stock_threshold IS NOT NULL AND di.quantity > di.low_stock_threshold
    )
    SELECT * FROM ranked WHERE donor_rank = 1 AND suggested_qty > 0
    ORDER BY CASE urgency WHEN 'URGENT' THEN 1 ELSE 2 END, suggested_qty DESC
    LIMIT $2`,
    [branchIds, meta.maxSuggestions]
  )
  return {
    data: {
      suggestions: rows.map((r) => ({
        sourceBranchAccountId: r.source_restaurant_id,
        sourceBranchAccountName: r.source_branch_account_name,
        destinationBranchAccountId: r.destination_restaurant_id,
        destinationBranchAccountName: r.destination_branch_account_name,
        productId: r.product_id,
        productName: r.product_name,
        productUnit: r.product_unit,
        urgency: r.urgency,
        sourceSurplusQty: Number(r.source_surplus_qty),
        destinationForecastQty: Number(r.forecast_reorder_qty),
        suggestedQty: Number(r.suggested_qty),
      })),
    },
    meta,
  }
}
/** Monthly authorized-Branch-Account order trends with no arbitrary date-span cap. */
export async function restaurantOrgAdvancedAnalytics(userId, organizationId, queryParams = {}) {
  const requested = parseRequestedBranchIds(queryParams)
  const branchIds = await resolveAuthorizedRestaurantBranchIds(userId, organizationId, requested)
  const from = queryParams.from ? new Date(queryParams.from) : new Date('2000-01-01T00:00:00.000Z')
  const to = queryParams.to ? new Date(queryParams.to) : new Date()
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to)
    throw new ValidationError('Valid from and to dates are required')
  if (!branchIds.length)
    return { data: { months: [] }, meta: { branchAccountIds: [], unrestrictedDateRange: true } }
  const { rows } = await query(
    `
    SELECT date_trunc('month', co.placed_at)::date AS month, r.id AS branch_account_id, r.name AS branch_account_name,
      COUNT(*)::int AS order_count, COALESCE(SUM(co.total_amount),0)::numeric AS spend
    FROM customer_order co JOIN restaurant r ON r.id=co.restaurant_id
    WHERE co.restaurant_id = ANY($1::uuid[]) AND co.placed_at >= $2 AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT','CANCELLED','PENDING_APPROVAL')
    GROUP BY 1, r.id, r.name ORDER BY month ASC, r.name ASC`,
    [branchIds, from, to]
  )
  return {
    data: {
      months: rows.map((r) => ({
        month: r.month,
        branchAccountId: r.branch_account_id,
        branchAccountName: r.branch_account_name,
        orderCount: Number(r.order_count),
        spend: Number(r.spend),
      })),
    },
    meta: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      branchAccountIds: branchIds,
      unrestrictedDateRange: true,
    },
  }
}
export async function supplierOrgConsolidatedOverview(userId, organizationId, queryParams = {}) {
  const params = parseReportQuery(queryParams)
  const { limit, offset } = parsePagination(queryParams)
  const requested = parseRequestedBranchIds(queryParams)
  const branchIds = await resolveAuthorizedSupplierBranchIds(userId, organizationId, requested)

  if (!branchIds.length) {
    return {
      data: {
        kpis: { order_count: 0, total_revenue: 0, active_branch_accounts: 0 },
        by_branch: [],
      },
      meta: {
        from: params.from.toISOString().slice(0, 10),
        to: params.to.toISOString().slice(0, 10),
        branchAccountIds: [],
        limit,
        offset,
        maxRangeDays: MAX_REPORT_RANGE_DAYS,
      },
    }
  }

  const { rows: kpiRows } = await query(
    `
    SELECT
      COUNT(DISTINCT co.id)::int AS order_count,
      COALESCE(SUM(oi.line_total), 0)::numeric AS total_revenue
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    WHERE oi.supplier_id = ANY($1::uuid[])
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    `,
    [branchIds, params.from, params.to]
  )

  const { rows: byBranch } = await query(
    `
    SELECT
      s.id AS branch_account_id,
      s.name AS branch_account_name,
      s.is_main_branch,
      COUNT(DISTINCT co.id)::int AS order_count,
      COALESCE(SUM(oi.line_total), 0)::numeric AS total_revenue
    FROM supplier s
    LEFT JOIN order_item oi ON oi.supplier_id = s.id
    LEFT JOIN customer_order co
      ON co.id = oi.order_id
     AND co.placed_at >= $2
     AND co.placed_at <= $3
     AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    WHERE s.id = ANY($1::uuid[])
    GROUP BY s.id, s.name, s.is_main_branch
    ORDER BY total_revenue DESC, s.name ASC
    LIMIT $4 OFFSET $5
    `,
    [branchIds, params.from, params.to, limit, offset]
  )

  return {
    data: {
      kpis: {
        order_count: Number(kpiRows[0]?.order_count || 0),
        total_revenue: Number(kpiRows[0]?.total_revenue || 0),
        active_branch_accounts: branchIds.length,
      },
      by_branch: byBranch,
    },
    meta: {
      from: params.from.toISOString().slice(0, 10),
      to: params.to.toISOString().slice(0, 10),
      branchAccountIds: branchIds,
      limit,
      offset,
      rowCount: byBranch.length,
      maxRangeDays: MAX_REPORT_RANGE_DAYS,
    },
  }
}

export { parseReportQuery, ValidationError }
