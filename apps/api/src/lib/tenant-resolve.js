/**
 * Resolve restaurant/supplier IDs from active tenant context (workspace membership,
 * impersonation, branch header) — not only primary contact_email.
 */
import { ValidationError } from '../middlewares/errorHandler.js'
import { getRestaurantIdForRequest, getSupplierIdForRequest } from './rbac.js'

export async function requireRestaurantId(req) {
  const restaurantId = await getRestaurantIdForRequest(req)
  if (!restaurantId) {
    throw new ValidationError('Restaurant not found')
  }
  return restaurantId
}

export async function requireSupplierId(req) {
  const supplierId = await getSupplierIdForRequest(req)
  if (!supplierId) {
    throw new ValidationError('Supplier not found')
  }
  return supplierId
}

/** @returns {{ tenantId: string, tenantType: 'RESTAURANT' | 'SUPPLIER' }} */
export async function requireTenantScope(req) {
  const restaurantId = await getRestaurantIdForRequest(req)
  if (restaurantId) {
    return { tenantId: restaurantId, tenantType: 'RESTAURANT' }
  }
  const supplierId = await getSupplierIdForRequest(req)
  if (supplierId) {
    return { tenantId: supplierId, tenantType: 'SUPPLIER' }
  }
  throw new ValidationError('Tenant context required')
}
