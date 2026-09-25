import { query } from './db.js'
import { ValidationError } from '../middlewares/errorHandler.js'

/**
 * Legacy operational `branch` rows live inside one restaurant tenant.
 * Reject IDs that belong to another restaurant (or do not exist).
 */
export async function assertLegacyBranchOwnedByRestaurant(
  branchId,
  restaurantId,
  { db = query } = {}
) {
  if (!branchId) return null
  const { rows } = await db(
    `SELECT id FROM branch
     WHERE id = $1 AND tenant_id = $2 AND COALESCE(is_active, TRUE) = TRUE`,
    [branchId, restaurantId]
  )
  if (!rows.length) {
    throw new ValidationError('Branch not found for this restaurant')
  }
  return rows[0]
}

export async function assertLegacyBranchesOwnedByRestaurant(
  branchIds,
  restaurantId,
  { db = query } = {}
) {
  const ids = [...new Set((branchIds || []).filter(Boolean).map((id) => String(id)))]
  if (!ids.length) return []
  const { rows } = await db(
    `SELECT id FROM branch
     WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND COALESCE(is_active, TRUE) = TRUE`,
    [ids, restaurantId]
  )
  if (rows.length !== ids.length) {
    throw new ValidationError('One or more branches are not part of this restaurant')
  }
  return rows
}
