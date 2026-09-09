import { NotFoundError } from '../middlewares/errorHandler.js'
import { requireRestaurantId, requireSupplierId } from './tenant-resolve.js'
import { getEffectiveTenant } from './impersonation.js'

/**
 * Assert the authenticated user may access this invoice row.
 * @param {import('express').Request} req
 * @param {{ supplier_id: string, restaurant_id: string }} invoice
 */
export async function assertInvoiceTenantAccess(req, invoice) {
  const role = req.userData?.role
  if (role === 'ADMIN') {
    const effectiveTenant = getEffectiveTenant(req)
    if (!effectiveTenant) return
    const matchesSupplier =
      effectiveTenant.tenantType === 'SUPPLIER' && effectiveTenant.tenantId === invoice.supplier_id
    const matchesRestaurant =
      effectiveTenant.tenantType === 'RESTAURANT' &&
      effectiveTenant.tenantId === invoice.restaurant_id
    if (matchesSupplier || matchesRestaurant) return
    throw new NotFoundError('Invoice not found')
  }
  if (role === 'SUPPLIER') {
    const supplierId = await requireSupplierId(req)
    if (supplierId !== invoice.supplier_id) {
      throw new NotFoundError('Invoice not found')
    }
    return
  }
  if (role === 'RESTAURANT') {
    const restaurantId = await requireRestaurantId(req)
    if (restaurantId !== invoice.restaurant_id) {
      throw new NotFoundError('Invoice not found')
    }
    return
  }
  throw new NotFoundError('Invoice not found')
}

/**
 * Resolve tenant filter column for list queries.
 */
export function invoiceTenantColumn(tenantType) {
  return tenantType === 'SUPPLIER' ? 'supplier_id' : 'restaurant_id'
}
