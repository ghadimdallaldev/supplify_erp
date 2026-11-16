import type { User } from '../types'

/** Resource scopes never grant permissions; hide unsupported tenant-wide surfaces. */
export function warehouseScopeAllowsPermission(user: User, permission: string): boolean {
  if (user.role !== 'SUPPLIER' || user.warehouseAccess?.mode !== 'assigned') return true
  return /^(WAREHOUSES_(VIEW|EDIT|MANAGE)|ORDERS_(VIEW|EDIT|MANAGE)|FULFILLMENT_TRANSFER|DRIVER_DELIVERIES_(VIEW|MANAGE)|SUBSCRIPTIONS_(VIEW|MANAGE))$/.test(
    permission
  )
}
