/**
 * Shared Branch Account lifecycle guards + permission cache fan-out.
 * Used by supplier and restaurant org deactivate / unlink / reactivate.
 */
import { query } from './db.js'
import { getWarehouseSupplierColumn } from './warehouse-helpers.js'

export const DEACTIVATION_BLOCKER = {
  PENDING_ORDERS: 'PENDING_ORDERS',
  ACTIVE_WAREHOUSE_RESERVATIONS: 'ACTIVE_WAREHOUSE_RESERVATIONS',
  OPEN_INVOICES: 'OPEN_INVOICES',
  SCHEDULED_STAFF: 'SCHEDULED_STAFF',
  PENDING_CENTRAL_PURCHASING: 'PENDING_CENTRAL_PURCHASING',
}

const BLOCKER_MESSAGES = {
  [DEACTIVATION_BLOCKER.PENDING_ORDERS]: 'Branch Account has open orders and cannot be deactivated',
  [DEACTIVATION_BLOCKER.ACTIVE_WAREHOUSE_RESERVATIONS]:
    'Branch Account has active warehouse reservations',
  [DEACTIVATION_BLOCKER.OPEN_INVOICES]:
    'Branch Account has unpaid invoices that must be settled or voided first',
  [DEACTIVATION_BLOCKER.SCHEDULED_STAFF]: 'Branch Account has upcoming or open staff shifts',
  [DEACTIVATION_BLOCKER.PENDING_CENTRAL_PURCHASING]:
    'Branch Account has open central purchasing drafts',
}

export function deactivationBlockerMessage(code) {
  return BLOCKER_MESSAGES[code] || 'Branch Account cannot be deactivated'
}

export async function supplierHasActiveWarehouseReservations(supplierId) {
  const supplierCol = await getWarehouseSupplierColumn()
  const { rows } = await query(
    `
    SELECT 1
    FROM order_warehouse_assignment owa
    JOIN warehouse w ON w.id = owa.warehouse_id
    WHERE w.${supplierCol} = $1
      AND owa.status IN ('pending', 'picking', 'packed')
    LIMIT 1
    `,
    [supplierId]
  )
  return rows.length > 0
}

export async function tenantHasOpenBillingInvoices(tenantId, tenantType) {
  const { rows } = await query(
    `
    SELECT 1
    FROM billing_invoice
    WHERE tenant_id = $1
      AND tenant_type = $2
      AND status = 'OPEN'
    LIMIT 1
    `,
    [tenantId, tenantType]
  )
  return rows.length > 0
}

export async function restaurantHasScheduledStaff(restaurantId) {
  const { rows } = await query(
    `
    SELECT 1
    FROM staff_shift
    WHERE restaurant_id = $1
      AND status IN ('DRAFT', 'PUBLISHED')
      AND shift_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    LIMIT 1
    `,
    [restaurantId]
  )
  return rows.length > 0
}

export async function restaurantHasPendingCentralPurchasingDrafts(restaurantId) {
  const { rows } = await query(
    `
    SELECT 1
    FROM central_purchasing_draft
    WHERE destination_restaurant_id = $1
      AND status = 'draft'
    LIMIT 1
    `,
    [restaurantId]
  )
  return rows.length > 0
}

/**
 * Collect deactivation blockers for a supplier Branch Account (beyond main-branch).
 */
export async function getSupplierDeactivationBlockers(supplierId, { hasPendingOrders }) {
  const blockers = []
  if (hasPendingOrders) {
    blockers.push({
      code: DEACTIVATION_BLOCKER.PENDING_ORDERS,
      message: deactivationBlockerMessage(DEACTIVATION_BLOCKER.PENDING_ORDERS),
    })
  }
  if (await supplierHasActiveWarehouseReservations(supplierId)) {
    blockers.push({
      code: DEACTIVATION_BLOCKER.ACTIVE_WAREHOUSE_RESERVATIONS,
      message: deactivationBlockerMessage(DEACTIVATION_BLOCKER.ACTIVE_WAREHOUSE_RESERVATIONS),
    })
  }
  if (await tenantHasOpenBillingInvoices(supplierId, 'SUPPLIER')) {
    blockers.push({
      code: DEACTIVATION_BLOCKER.OPEN_INVOICES,
      message: deactivationBlockerMessage(DEACTIVATION_BLOCKER.OPEN_INVOICES),
    })
  }
  return blockers
}

/**
 * Collect deactivation blockers for a restaurant Branch Account (beyond main-branch).
 */
export async function getRestaurantDeactivationBlockers(restaurantId, { hasPendingOrders }) {
  const blockers = []
  if (hasPendingOrders) {
    blockers.push({
      code: DEACTIVATION_BLOCKER.PENDING_ORDERS,
      message: deactivationBlockerMessage(DEACTIVATION_BLOCKER.PENDING_ORDERS),
    })
  }
  if (await tenantHasOpenBillingInvoices(restaurantId, 'RESTAURANT')) {
    blockers.push({
      code: DEACTIVATION_BLOCKER.OPEN_INVOICES,
      message: deactivationBlockerMessage(DEACTIVATION_BLOCKER.OPEN_INVOICES),
    })
  }
  if (await restaurantHasScheduledStaff(restaurantId)) {
    blockers.push({
      code: DEACTIVATION_BLOCKER.SCHEDULED_STAFF,
      message: deactivationBlockerMessage(DEACTIVATION_BLOCKER.SCHEDULED_STAFF),
    })
  }
  if (await restaurantHasPendingCentralPurchasingDrafts(restaurantId)) {
    blockers.push({
      code: DEACTIVATION_BLOCKER.PENDING_CENTRAL_PURCHASING,
      message: deactivationBlockerMessage(DEACTIVATION_BLOCKER.PENDING_CENTRAL_PURCHASING),
    })
  }
  return blockers
}

/**
 * Invalidate permission caches for every user who can access this supplier branch,
 * plus org-scoped users across all org branches.
 */
export async function invalidateCachesForSupplierBranchLifecycle(supplierId, organizationId) {
  const { invalidateUserPermissionCache } = await import('./permissions.js')

  const { rows: branchUsers } = await query(
    `
    SELECT DISTINCT user_id
    FROM tenant_user_roles
    WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER'
    `,
    [supplierId]
  )
  await Promise.all(
    branchUsers.map((row) => invalidateUserPermissionCache(row.user_id, supplierId, 'SUPPLIER'))
  )

  if (!organizationId) return

  const { rows: orgUsers } = await query(
    `
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM org_user_roles WHERE organization_id = $1
      UNION
      SELECT user_id FROM org_user_branch_access WHERE organization_id = $1
    ) u
    `,
    [organizationId]
  )

  const { rows: orgBranches } = await query(`SELECT id FROM supplier WHERE organization_id = $1`, [
    organizationId,
  ])

  await Promise.all(
    orgUsers.flatMap((user) =>
      orgBranches.map((branch) =>
        invalidateUserPermissionCache(user.user_id, branch.id, 'SUPPLIER')
      )
    )
  )

  // Detached branch still needs org-user caches cleared for this tenant id
  if (!orgBranches.some((b) => b.id === supplierId)) {
    await Promise.all(
      orgUsers.map((user) => invalidateUserPermissionCache(user.user_id, supplierId, 'SUPPLIER'))
    )
  }
}

/**
 * Invalidate permission caches for every user who can access this restaurant branch,
 * plus org-scoped users across all org branches.
 */
export async function invalidateCachesForRestaurantBranchLifecycle(restaurantId, organizationId) {
  const { invalidateUserPermissionCache } = await import('./permissions.js')

  const { rows: branchUsers } = await query(
    `
    SELECT DISTINCT user_id
    FROM tenant_user_roles
    WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT'
    `,
    [restaurantId]
  )
  await Promise.all(
    branchUsers.map((row) => invalidateUserPermissionCache(row.user_id, restaurantId, 'RESTAURANT'))
  )

  if (!organizationId) return

  const { rows: orgUsers } = await query(
    `
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM restaurant_org_user_roles WHERE organization_id = $1
      UNION
      SELECT user_id FROM restaurant_org_user_branch_access WHERE organization_id = $1
    ) u
    `,
    [organizationId]
  )

  const { rows: orgBranches } = await query(
    `SELECT id FROM restaurant WHERE organization_id = $1`,
    [organizationId]
  )

  await Promise.all(
    orgUsers.flatMap((user) =>
      orgBranches.map((branch) =>
        invalidateUserPermissionCache(user.user_id, branch.id, 'RESTAURANT')
      )
    )
  )

  if (!orgBranches.some((b) => b.id === restaurantId)) {
    await Promise.all(
      orgUsers.map((user) =>
        invalidateUserPermissionCache(user.user_id, restaurantId, 'RESTAURANT')
      )
    )
  }
}
