import { query } from './db.js'
import { isSupplifyV2 } from '../config/supplifyModel.js'

export const WORKSPACE_MODE_FULL = 'full'
export const WORKSPACE_MODE_BUYER_ONLY = 'buyer_only'

/**
 * @param {string} restaurantId
 * @returns {Promise<'full'|'buyer_only'>}
 */
export async function getRestaurantWorkspaceMode(restaurantId) {
  if (!restaurantId) return WORKSPACE_MODE_FULL
  const { rows } = await query(`SELECT workspace_mode FROM restaurant WHERE id = $1`, [
    restaurantId,
  ])
  const mode = rows[0]?.workspace_mode
  if (mode === WORKSPACE_MODE_BUYER_ONLY) return WORKSPACE_MODE_BUYER_ONLY
  return WORKSPACE_MODE_FULL
}

export async function isBuyerOnlyRestaurant(restaurantId) {
  if (!isSupplifyV2()) return false
  return (await getRestaurantWorkspaceMode(restaurantId)) === WORKSPACE_MODE_BUYER_ONLY
}

/**
 * @param {string} restaurantId
 * @param {string} supplierId
 */
export async function hasActiveSupplierRestaurantLink(restaurantId, supplierId) {
  if (!restaurantId || !supplierId) return false
  const { rows } = await query(
    `SELECT 1 FROM supplier_restaurant_links
     WHERE restaurant_id = $1 AND supplier_id = $2 AND status = 'active'
     LIMIT 1`,
    [restaurantId, supplierId]
  )
  return rows.length > 0
}

/**
 * @param {string} restaurantId
 * @returns {Promise<string[]>}
 */
export async function getLinkedSupplierIdsForRestaurant(restaurantId) {
  const { rows } = await query(
    `SELECT supplier_id FROM supplier_restaurant_links
     WHERE restaurant_id = $1 AND status = 'active'`,
    [restaurantId]
  )
  return rows.map((r) => r.supplier_id)
}
