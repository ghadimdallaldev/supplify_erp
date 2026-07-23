/**
 * Central purchasing foundation (Restaurant Scale — multi_branch = central_purchasing).
 * Drafts are per destination Branch Account — no organization-owned orders.
 */
import { query, withTransaction } from '../lib/db.js'
import { getTenantSubscription } from '../lib/subscription.js'
import { resolveEffectivePlanFeatures } from '../lib/subscription/free-trial-plan-features.js'
import { resolveOrgBillingTenantId } from '../lib/org-billing-tenant.js'
import { listRestaurantOrgBranchesForUser } from '../lib/restaurant-org.js'
import { ValidationError } from '../middlewares/errorHandler.js'

export function isCentralPurchasingPlanFeature(planFeatures) {
  const value = planFeatures?.multi_branch
  return value === 'central_purchasing'
}

export async function assertCentralPurchasingEnabled(restaurantId) {
  const billingTenantId = await resolveOrgBillingTenantId(restaurantId, 'RESTAURANT')
  const subscription = await getTenantSubscription(billingTenantId, 'RESTAURANT', {
    skipOrgBilling: true,
  })
  const planFeatures = await resolveEffectivePlanFeatures(subscription)
  if (!isCentralPurchasingPlanFeature(planFeatures)) {
    const err = new ValidationError(
      'Central purchasing requires Restaurant Scale (multi_branch: central_purchasing). Full workflow is not complete — drafts and per-branch submit only.'
    )
    err.statusCode = 403
    err.code = 'FEATURE_REQUIRED'
    throw err
  }
  return true
}

export async function listCentralPurchasingBranchAccounts(userId, organizationId) {
  const branches = await listRestaurantOrgBranchesForUser(userId, organizationId)
  return branches.filter((b) => b.is_branch_active !== false)
}

export async function getOrCreateCentralPurchasingDraft({
  organizationId,
  destinationRestaurantId,
  userId,
}) {
  const { rows: existing } = await query(
    `
    SELECT *
    FROM central_purchasing_draft
    WHERE organization_id = $1
      AND destination_restaurant_id = $2
      AND created_by = $3
      AND status = 'draft'
    LIMIT 1
    `,
    [organizationId, destinationRestaurantId, userId]
  )
  if (existing.length) return existing[0]

  const { rows } = await query(
    `
    INSERT INTO central_purchasing_draft (
      organization_id, destination_restaurant_id, created_by, status, line_items
    ) VALUES ($1, $2, $3, 'draft', '[]'::jsonb)
    RETURNING *
    `,
    [organizationId, destinationRestaurantId, userId]
  )
  return rows[0]
}

export async function listCentralPurchasingDrafts(userId, organizationId) {
  const { rows } = await query(
    `
    SELECT d.id, d.destination_restaurant_id AS destination_branch_account_id,
           r.name AS destination_branch_account_name,
           d.status, d.line_items, d.updated_at, d.created_at, d.submitted_order_id,
           jsonb_array_length(COALESCE(d.line_items, '[]'::jsonb)) AS line_count
    FROM central_purchasing_draft d
    JOIN restaurant r ON r.id = d.destination_restaurant_id
    WHERE d.created_by = $1
      AND d.organization_id = $2
      AND d.status = 'draft'
    ORDER BY r.name ASC
    `,
    [userId, organizationId]
  )
  return rows
}

export async function updateCentralPurchasingDraftLines({
  draftId,
  userId,
  organizationId,
  lineItems,
}) {
  const { rows } = await query(
    `
    UPDATE central_purchasing_draft
    SET line_items = $4::jsonb, updated_at = NOW()
    WHERE id = $1 AND created_by = $2 AND organization_id = $3 AND status = 'draft'
    RETURNING *
    `,
    [draftId, userId, organizationId, JSON.stringify(lineItems || [])]
  )
  return rows[0] || null
}

/**
 * Convert each destination draft into a separate DRAFT/PENDING customer_order.
 * Reports partial failures per Branch Account. No organization-owned orders.
 */
export async function submitCentralPurchasingDrafts({
  userId,
  organizationId,
  destinationRestaurantIds,
}) {
  const results = []
  for (const destinationId of destinationRestaurantIds) {
    try {
      const outcome = await withTransaction(async (client) => {
        const { rows: drafts } = await client.query(
          `
          SELECT * FROM central_purchasing_draft
          WHERE organization_id = $1
            AND destination_restaurant_id = $2
            AND created_by = $3
            AND status = 'draft'
          FOR UPDATE
          `,
          [organizationId, destinationId, userId]
        )
        if (!drafts.length) return { ok: false, reason: 'NO_DRAFT' }
        const draft = drafts[0]
        const lines = Array.isArray(draft.line_items) ? draft.line_items : []
        if (!lines.length) return { ok: false, reason: 'EMPTY_DRAFT' }

        const { rows: orderRows } = await client.query(
          `
          INSERT INTO customer_order (restaurant_id, status, total_amount, placed_at)
          VALUES ($1, 'PENDING', 0, NOW())
          RETURNING id
          `,
          [destinationId]
        )
        const orderId = orderRows[0].id
        let total = 0
        for (const line of lines) {
          const qty = Number(line.quantity || 0)
          const price = Number(line.unit_price || 0)
          if (!line.product_id || qty <= 0) continue
          const lineTotal = qty * price
          total += lineTotal
          await client.query(
            `
            INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              orderId,
              line.product_id,
              line.supplier_id,
              qty,
              price,
              lineTotal,
              line.notes || 'central_purchasing',
            ]
          )
        }
        await client.query(
          `UPDATE customer_order SET total_amount = $2, updated_at = NOW() WHERE id = $1`,
          [orderId, total]
        )
        await client.query(
          `
          UPDATE central_purchasing_draft
          SET status = 'submitted', submitted_order_id = $2, updated_at = NOW()
          WHERE id = $1
          `,
          [draft.id, orderId]
        )
        return { ok: true, orderId }
      })
      results.push({ destination_branch_account_id: destinationId, ...outcome })
    } catch (err) {
      results.push({
        destination_branch_account_id: destinationId,
        ok: false,
        reason: 'SUBMIT_FAILED',
        message: err.message,
      })
    }
  }

  const succeeded = results.filter((r) => r.ok).length
  const failed = results.length - succeeded
  return {
    results,
    summary: { total: results.length, succeeded, failed },
    partialFailure: failed > 0 && succeeded > 0,
  }
}
