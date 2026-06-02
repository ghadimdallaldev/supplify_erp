import { query } from './db.js'
import { getSupplifyModelVersion, isSupplifyV2 } from '../config/supplifyModel.js'

/**
 * Aggregate counters for V1/V2 business model comparison (admin POC).
 */
export async function buildSupplifyModelComparisonMetrics() {
  const version = getSupplifyModelVersion()

  const [
    invitesSent,
    invitesAccepted,
    buyerOnlyRestaurants,
    workspaceUpgrades,
    buyerPaidSubscriptions,
    supplierStoreOrders,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM supplier_restaurant_invitations`),
    query(
      `SELECT COUNT(*)::int AS c FROM supplier_restaurant_invitations WHERE status = 'accepted'`
    ),
    query(`SELECT COUNT(*)::int AS c FROM restaurant WHERE workspace_mode = 'buyer_only'`),
    query(`SELECT COUNT(*)::int AS c FROM restaurant WHERE workspace_upgraded_at IS NOT NULL`),
    query(
      `
      SELECT COUNT(DISTINCT r.id)::int AS c
      FROM restaurant r
      JOIN subscription s ON s.tenant_id = r.id AND s.tenant_type = 'RESTAURANT'
      JOIN subscription_plan p ON p.id = s.plan_id
      WHERE r.workspace_mode = 'full'
        AND r.workspace_upgraded_at IS NOT NULL
        AND LOWER(p.code) NOT IN ('free', 'buyer_free')
        AND s.status IN ('active', 'trialing', 'pending_activation')
      `
    ),
    query(
      `
      SELECT COUNT(DISTINCT o.id)::int AS c
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      JOIN supplier_restaurant_links l
        ON l.restaurant_id = o.restaurant_id
       AND l.supplier_id = o.supplier_id
       AND l.status = 'active'
      WHERE r.workspace_mode = 'buyer_only'
      `
    ).catch(() => ({ rows: [{ c: 0 }] })),
  ])

  const sent = invitesSent.rows[0]?.c ?? 0
  const accepted = invitesAccepted.rows[0]?.c ?? 0
  const buyerOnly = buyerOnlyRestaurants.rows[0]?.c ?? 0
  const upgrades = workspaceUpgrades.rows[0]?.c ?? 0
  const paidAfterUpgrade = buyerPaidSubscriptions.rows[0]?.c ?? 0
  const storeOrders = supplierStoreOrders.rows[0]?.c ?? 0

  const buyerToPaidConversionRate =
    buyerOnly > 0 ? Math.round((upgrades / buyerOnly) * 1000) / 10 : 0

  return {
    supplifyModelVersion: version,
    v2FeaturesEnabled: isSupplifyV2(),
    supplierInvitesSent: sent,
    supplierInvitesAccepted: accepted,
    inviteAcceptanceRate: sent > 0 ? Math.round((accepted / sent) * 1000) / 10 : 0,
    buyerOnlyRestaurants: buyerOnly,
    restaurantWorkspaceUpgrades: upgrades,
    buyerToPaidConversionRate,
    restaurantsWithPaidPlanAfterUpgrade: paidAfterUpgrade,
    supplierStoreOrders: storeOrders,
    generatedAt: new Date().toISOString(),
  }
}
