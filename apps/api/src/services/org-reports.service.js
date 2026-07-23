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
