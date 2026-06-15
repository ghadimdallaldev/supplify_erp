import { randomUUID } from 'crypto'
import { Router } from 'express'
import { query, pool } from '../../lib/db.js'
import { requireAuth, requireRole, resolveAdminContext, requirePermission } from '../../lib/rbac.js'
import { z } from 'zod'
import { logger } from '../../lib/logger.js'
import { ZodError } from 'zod'
import { config } from '../../config/env.js'
import { deliveredOrderStatusInSql } from '../../lib/order-statuses.js'
import { parseAdminListPagination } from '../../lib/admin-list-pagination.js'
import { columnExists } from '../../lib/ensure-tenant-branding-schema.js'
import {
  createImpersonationToken,
  verifyImpersonationToken,
  getImpersonationCookieName,
  getEffectiveTenant,
  clearImpersonationCookie,
} from '../../lib/impersonation.js'
import {
  getEntitlements,
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_LIMIT_KEYS,
  invalidateTenantSubscriptionCache,
  discoverLimitKeys,
  checkLimit,
} from '../../lib/subscription.js'
import { resolveEffectiveLimit } from '../../lib/limit-resolution.js'
import {
  resolveOrgBillingTenantId,
  resolveActiveBillingSubscription,
  resolveActiveBillingSubscriptionsBatch,
} from '../../lib/org-billing-tenant.js'
import { clearActiveTenantCookie } from '../../lib/tenant-switch.js'
import {
  defaultAddonUnitPrice,
  getActiveTenantAddons,
  isAddonKeyValidForTenant,
} from '../../lib/subscription-addons.js'
import { getAllowedFeatureKeys, featureDisplayName } from '../../lib/feature-keys.js'
import {
  listGlobalFeatureFlags,
  setGlobalFeatureOverride,
  listTenantFeatureOverrides,
  getEffectiveFeaturesForTenant,
  setTenantFeatureOverride,
  clearTenantFeatureOverride,
} from '../../lib/feature-flags.js'
import { writeAuditLog } from '../../lib/audit.js'
import { recordConversionEvent } from '../../lib/conversion-events.js'
import {
  extendFreeSandboxTrial,
  unlockSubscriptionAccount,
} from '../../lib/billing/billing-service.js'
import { clampFreeTrialDays } from '../../lib/platform-settings.js'
import {
  validatePlanLimitsAndFeatures,
  validateFreePlanTrialDays,
  validateEnterprisePlanActivation,
  validateEnterprisePlanCreate,
  buildTierLadderWarnings,
} from '../../lib/plan-admin-validation.js'
import { isLimitKeyApplicable } from '../../lib/limit-resolution.js'
import { buildAdminOverviewMetrics } from '../../lib/admin-overview-metrics.js'
import { buildAdminActivityFeed } from '../../lib/admin-activity-feed.js'
import {
  buildAdminOperationalSummary,
  listAdminEmailDeliveryLogs,
  listAdminFulfillmentIssues,
  listAdminActiveDeliveries,
  buildTenantOperationalSnapshot,
  getAdminEmailHealthFailures,
} from '../../lib/admin-operational-metrics.js'
import {
  adminResetUserPassword,
  listAdminUsers,
} from '../../services/admin-user-password.service.js'
import { adminDashboardPermissionGuard, requireAnyPermission } from '../../lib/route-permissions.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'

const router = Router()

// ========================================
// TENANT MANAGEMENT
// ========================================

/** Align admin tenant rows with the subscription row used for entitlements (org main branch). */
async function attachBillingSubscriptionFields(rows, tenantType) {
  if (!rows.length) return
  const batch = await resolveActiveBillingSubscriptionsBatch(
    rows.map((row) => row.id),
    tenantType
  )
  for (const row of rows) {
    const billing = batch.get(row.id)
    if (!billing?.subscription) continue
    row.subscription_id = billing.subscription.id
    row.uses_org_billing = billing.usesOrgBilling
    row.billing_tenant_id = billing.billingTenantId
    row.subscription_status = billing.subscription.status
    row.plan_name = billing.subscription.plan_name
    row.plan_code = billing.plan_code ?? row.plan_code
  }
}

async function buildSupplierListSelectFields() {
  const [hasSlug, hasContactEmail, hasPhone, hasLogoUrl, hasAccountStatus] = await Promise.all([
    columnExists('supplier', 'slug'),
    columnExists('supplier', 'contact_email'),
    columnExists('supplier', 'phone'),
    columnExists('supplier', 'logo_url'),
    columnExists('supplier', 'account_status'),
  ])

  return {
    slugSelect: hasSlug ? 's.slug,' : 'NULL::text AS slug,',
    contactEmailSelect: hasContactEmail ? 's.contact_email,' : 'NULL::text AS contact_email,',
    phoneSelect: hasPhone ? 's.phone,' : 'NULL::text AS phone,',
    logoUrlSelect: hasLogoUrl ? 's.logo_url,' : 'NULL::text AS logo_url,',
    accountStatusSelect: hasAccountStatus ? 's.account_status,' : 'NULL::text AS account_status,',
  }
}

async function buildRestaurantListSelectFields() {
  const [hasSlug, hasContactEmail, hasPhone, hasLogoUrl, hasBusinessType, hasAccountStatus] =
    await Promise.all([
      columnExists('restaurant', 'slug'),
      columnExists('restaurant', 'contact_email'),
      columnExists('restaurant', 'phone'),
      columnExists('restaurant', 'logo_url'),
      columnExists('restaurant', 'business_type'),
      columnExists('restaurant', 'account_status'),
    ])

  return {
    slugSelect: hasSlug ? 'r.slug,' : 'NULL::text AS slug,',
    contactEmailSelect: hasContactEmail ? 'r.contact_email,' : 'NULL::text AS contact_email,',
    phoneSelect: hasPhone ? 'r.phone,' : 'NULL::text AS phone,',
    logoUrlSelect: hasLogoUrl ? 'r.logo_url,' : 'NULL::text AS logo_url,',
    businessTypeSelect: hasBusinessType ? 'r.business_type,' : 'NULL::text AS business_type,',
    accountStatusSelect: hasAccountStatus ? 'r.account_status,' : 'NULL::text AS account_status,',
  }
}

// Get suppliers with detailed info
router.get('/tenants/suppliers', async (req, res) => {
  try {
    const { limit, offset } = parseAdminListPagination(req.query)
    const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM supplier`)
    const total = countRows[0]?.total ?? 0

    const { slugSelect, contactEmailSelect, phoneSelect, logoUrlSelect, accountStatusSelect } =
      await buildSupplierListSelectFields()

    const { rows: suppliers } = await query(
      `
      SELECT 
        s.id,
        s.name,
        ${slugSelect}
        ${contactEmailSelect}
        ${phoneSelect}
        ${logoUrlSelect}
        ${accountStatusSelect}
        s.created_at,
        s.updated_at,
        sub.status as subscription_status,
        sub.plan_name,
        sp.code as plan_code,
        sub.id as subscription_id,
        COALESCE(pc.product_count, 0)::int as product_count,
        COALESCE(wc.warehouse_count, 0)::int as warehouse_count,
        COALESCE(rev.total_revenue, 0)::numeric(12,2) as total_revenue,
        COALESCE(ad.active_deals_count, 0)::int AS active_deals_count,
        COALESCE(st.storage_mb_used, 0)::int AS storage_mb_used
      FROM supplier s
      LEFT JOIN subscription sub ON sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER' AND sub.status IN ('ACTIVE', 'TRIALING')
      LEFT JOIN subscription_plan sp ON sp.id = sub.plan_id
      LEFT JOIN (
        SELECT supplier_id, COUNT(*)::int AS product_count FROM product GROUP BY supplier_id
      ) pc ON pc.supplier_id = s.id
      LEFT JOIN (
        SELECT supplier_id, COUNT(*)::int AS warehouse_count
        FROM warehouse WHERE is_active = true GROUP BY supplier_id
      ) wc ON wc.supplier_id = s.id
      LEFT JOIN (
        SELECT oi.supplier_id, COALESCE(SUM(oi.line_total), 0) AS total_revenue
        FROM order_item oi
        JOIN customer_order o ON o.id = oi.order_id
        WHERE ${deliveredOrderStatusInSql('o.status')}
        GROUP BY oi.supplier_id
      ) rev ON rev.supplier_id = s.id
      LEFT JOIN (
        SELECT p.supplier_id, COUNT(*)::int AS active_deals_count
        FROM promotions p
        WHERE p.status = 'active'
          AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
          AND p.starts_at <= NOW()
          AND (p.ends_at IS NULL OR p.ends_at > NOW())
          AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
        GROUP BY p.supplier_id
      ) ad ON ad.supplier_id = s.id
      LEFT JOIN (
        SELECT um.tenant_id AS supplier_id, MAX(um.current_value)::int AS storage_mb_used
        FROM usage_meter um
        WHERE um.tenant_type = 'SUPPLIER'
          AND um.meter_type = 'storage_mb'
          AND um.period_start_date = '2000-01-01'
        GROUP BY um.tenant_id
      ) st ON st.supplier_id = s.id
      ORDER BY s.name
      LIMIT $1 OFFSET $2
    `,
      [limit, offset]
    )

    await attachBillingSubscriptionFields(suppliers, 'SUPPLIER')

    res.json({
      ok: true,
      data: { suppliers, total, limit, offset },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get suppliers error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get suppliers' },
      requestId: req.requestId,
    })
  }
})

// Get restaurants with detailed info
router.get('/tenants/restaurants', async (req, res) => {
  try {
    const { limit, offset } = parseAdminListPagination(req.query)
    const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM restaurant`)
    const total = countRows[0]?.total ?? 0

    const {
      slugSelect,
      contactEmailSelect,
      phoneSelect,
      logoUrlSelect,
      businessTypeSelect,
      accountStatusSelect,
    } = await buildRestaurantListSelectFields()

    const { rows: restaurants } = await query(
      `
      SELECT 
        r.id,
        r.name,
        ${slugSelect}
        ${contactEmailSelect}
        ${phoneSelect}
        ${logoUrlSelect}
        ${businessTypeSelect}
        ${accountStatusSelect}
        r.created_at,
        r.updated_at,
        sub.status as subscription_status,
        sub.plan_name,
        sp.code as plan_code,
        sub.id as subscription_id,
        COALESCE(oc.order_count, 0)::int as order_count,
        COALESCE(oc.total_spent, 0)::numeric(12,2) as total_spent,
        COALESCE(oc.orders_last_30d, 0)::int as orders_last_30d,
        COALESCE(ot.orders_today, 0)::int AS orders_today,
        COALESCE(sf.connected_suppliers_count, 0)::int AS connected_suppliers_count,
        COALESCE(inv.inventory_skus_count, 0)::int AS inventory_skus_count,
        COALESCE(st.storage_mb_used, 0)::int AS storage_mb_used
      FROM restaurant r
      LEFT JOIN subscription sub ON sub.tenant_id = r.id AND sub.tenant_type = 'RESTAURANT' AND sub.status IN ('ACTIVE', 'TRIALING')
      LEFT JOIN subscription_plan sp ON sp.id = sub.plan_id
      LEFT JOIN (
        SELECT
          restaurant_id,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(total_amount) FILTER (WHERE ${deliveredOrderStatusInSql()}), 0) AS total_spent,
          COUNT(*) FILTER (WHERE placed_at >= NOW() - INTERVAL '30 days')::int AS orders_last_30d
        FROM customer_order
        GROUP BY restaurant_id
      ) oc ON oc.restaurant_id = r.id
      LEFT JOIN (
        SELECT co.restaurant_id, COUNT(*)::int AS orders_today
        FROM customer_order co
        WHERE co.status = 'PLACED'
          AND DATE(co.placed_at) = CURRENT_DATE
        GROUP BY co.restaurant_id
      ) ot ON ot.restaurant_id = r.id
      LEFT JOIN (
        SELECT sf.restaurant_id, COUNT(*)::int AS connected_suppliers_count
        FROM supplier_follow sf
        GROUP BY sf.restaurant_id
      ) sf ON sf.restaurant_id = r.id
      LEFT JOIN (
        SELECT ri.restaurant_id, COUNT(DISTINCT ri.product_id)::int AS inventory_skus_count
        FROM restaurant_inventory ri
        GROUP BY ri.restaurant_id
      ) inv ON inv.restaurant_id = r.id
      LEFT JOIN (
        SELECT um.tenant_id AS restaurant_id, MAX(um.current_value)::int AS storage_mb_used
        FROM usage_meter um
        WHERE um.tenant_type = 'RESTAURANT'
          AND um.meter_type = 'storage_mb'
          AND um.period_start_date = '2000-01-01'
        GROUP BY um.tenant_id
      ) st ON st.restaurant_id = r.id
      ORDER BY r.name
      LIMIT $1 OFFSET $2
    `,
      [limit, offset]
    )

    await attachBillingSubscriptionFields(restaurants, 'RESTAURANT')

    res.json({
      ok: true,
      data: { restaurants, total, limit, offset },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get restaurants error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get restaurants' },
      requestId: req.requestId,
    })
  }
})

async function buildSupplierTenantSearchSelectFields() {
  const [
    hasSlug,
    hasOrgId,
    hasMainBranch,
    hasContactEmail,
    hasSalesContactEmail,
    hasAccountingContactEmail,
  ] = await Promise.all([
    columnExists('supplier', 'slug'),
    columnExists('supplier', 'organization_id'),
    columnExists('supplier', 'is_main_branch'),
    columnExists('supplier', 'contact_email'),
    columnExists('supplier', 'sales_contact_email'),
    columnExists('supplier', 'accounting_contact_email'),
  ])

  const emailParts = []
  if (hasContactEmail) emailParts.push('s.contact_email')
  if (hasSalesContactEmail) emailParts.push('s.sales_contact_email')
  if (hasAccountingContactEmail) emailParts.push('s.accounting_contact_email')

  return {
    slugSelect: hasSlug ? 's.slug,' : 'NULL::text AS slug,',
    orgIdSelect: hasOrgId ? 's.organization_id,' : 'NULL::uuid AS organization_id,',
    mainBranchSelect: hasMainBranch ? 's.is_main_branch,' : 'NULL::boolean AS is_main_branch,',
    contactEmailSelect:
      emailParts.length > 0
        ? `COALESCE(${emailParts.join(', ')}) AS contact_email,`
        : 'NULL::text AS contact_email,',
  }
}

async function buildRestaurantTenantSearchSelectFields() {
  const [hasSlug, hasOrgId, hasMainBranch, hasContactEmail] = await Promise.all([
    columnExists('restaurant', 'slug'),
    columnExists('restaurant', 'organization_id'),
    columnExists('restaurant', 'is_main_branch'),
    columnExists('restaurant', 'contact_email'),
  ])

  return {
    slugSelect: hasSlug ? 'r.slug,' : 'NULL::text AS slug,',
    orgIdSelect: hasOrgId ? 'r.organization_id,' : 'NULL::uuid AS organization_id,',
    mainBranchSelect: hasMainBranch ? 'r.is_main_branch,' : 'NULL::boolean AS is_main_branch,',
    contactEmailSelect: hasContactEmail ? 'r.contact_email,' : 'NULL::text AS contact_email,',
  }
}

/**
 * GET /api/admin-dashboard/tenants/search?q=&type=RESTAURANT|SUPPLIER&orgMainOnly=true
 * Lightweight tenant lookup for admin limits / billing tools.
 */
router.get('/tenants/search', async (req, res) => {
  try {
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase()
    const type = req.query.type ? String(req.query.type).toUpperCase() : null
    const orgMainOnly = req.query.orgMainOnly === 'true'
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100)

    const results = []

    const matchesQuery = (row) => {
      if (!q) return true
      const haystack = [
        row.name,
        row.slug,
        row.contact_email,
        row.plan_code,
        row.plan_name,
        row.subscription_status,
        row.id,
        row.tenant_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    }

    if (!type || type === 'SUPPLIER') {
      const { slugSelect, orgIdSelect, mainBranchSelect, contactEmailSelect } =
        await buildSupplierTenantSearchSelectFields()
      const { rows } = await query(`
        SELECT
          s.id,
          s.name,
          ${slugSelect}
          ${orgIdSelect}
          ${mainBranchSelect}
          ${contactEmailSelect}
          sub.status AS subscription_status,
          sub.plan_name,
          (SELECT sp.code FROM subscription_plan sp WHERE sp.id = sub.plan_id LIMIT 1) AS plan_code,
          'SUPPLIER' AS tenant_type
        FROM supplier s
        LEFT JOIN subscription sub ON sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER'
          AND sub.status IN ('ACTIVE', 'TRIALING')
        ORDER BY s.name
      `)
      for (const row of rows) {
        if (orgMainOnly && row.is_main_branch === false) continue
        if (!matchesQuery(row)) continue
        results.push(row)
      }
    }

    if (!type || type === 'RESTAURANT') {
      const { slugSelect, orgIdSelect, mainBranchSelect, contactEmailSelect } =
        await buildRestaurantTenantSearchSelectFields()
      const { rows } = await query(`
        SELECT
          r.id,
          r.name,
          ${slugSelect}
          ${orgIdSelect}
          ${mainBranchSelect}
          ${contactEmailSelect}
          sub.status AS subscription_status,
          sub.plan_name,
          (SELECT sp.code FROM subscription_plan sp WHERE sp.id = sub.plan_id LIMIT 1) AS plan_code,
          'RESTAURANT' AS tenant_type
        FROM restaurant r
        LEFT JOIN subscription sub ON sub.tenant_id = r.id AND sub.tenant_type = 'RESTAURANT'
          AND sub.status IN ('ACTIVE', 'TRIALING')
        ORDER BY r.name
      `)
      for (const row of rows) {
        if (orgMainOnly && row.is_main_branch === false) continue
        if (!matchesQuery(row)) continue
        results.push(row)
      }
    }

    results.sort((a, b) => String(a.name).localeCompare(String(b.name)))

    res.json({
      ok: true,
      data: { tenants: results.slice(0, limit) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Tenant search error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to search tenants' },
      requestId: req.requestId,
    })
  }
})

export default router
