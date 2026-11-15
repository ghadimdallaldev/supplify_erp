import { useAuth } from '../features/auth/AuthContext'
import type { User } from '../types/supplify'

export const TENANT_OWNER_ROLE_NAMES = [
  'Owner',
  'RESTAURANT_OWNER',
  'SUPPLIER_OWNER',
] as const

/** Matches API `assistantAccessGuard` (Owner still bypasses via `can`). */
export const ASSISTANT_ACCESS_PERMISSIONS = [
  'ORDERS_VIEW',
  'INVENTORY_VIEW',
  'INVOICES_VIEW',
  'FULFILLMENT_VIEW',
  'CATALOG_VIEW',
  'SETTINGS_VIEW',
  'RESERVATIONS_VIEW',
  'CHAT_VIEW',
] as const

export function isTenantOwner(user: User | null | undefined): boolean {
  if (!user) return false
  const roles = user.tenantRoles ?? []
  const workspaceRole = user.workspace?.roleName
  return TENANT_OWNER_ROLE_NAMES.some(
    (name) => roles.includes(name) || workspaceRole === name
  )
}

/** Supplier customer growth — owners always; others need growth permissions. */
export function canViewSupplierGrowth(
  user: User | null | undefined,
  can: (key: string) => boolean
): boolean {
  if (isTenantOwner(user)) return true
  return can('GROWTH_VIEW') || can('CUSTOMERS_MANAGE')
}

export function userHasPermission(
  user: User | null | undefined,
  required: string
): boolean {
  if (!user) return false
  if (user.role === 'RESTAURANT' || user.role === 'SUPPLIER') {
    if (isTenantOwner(user)) return true
  }

  const permissions =
    user.role === 'ADMIN' ? user.adminPermissions ?? [] : user.tenantPermissions ?? []
  if (permissions.includes(required)) return true

  if (required.endsWith('_VIEW_COSTS')) {
    const manageKey = `${required.replace(/_VIEW_COSTS$/, '')}_MANAGE`
    if (permissions.includes(manageKey)) return true
  }

  const manageKey = required.replace(
    /_VIEW$|_CREATE$|_EDIT$|_SEND$|_IMPORT$|_MANAGE$/,
    '_MANAGE'
  )
  return manageKey !== required && permissions.includes(manageKey)
}

export function usePermissions() {
  const { user } = useAuth()
  const permissions =
    user?.role === 'ADMIN' ? user.adminPermissions ?? [] : user?.tenantPermissions ?? []
  const can = (permission: string) => userHasPermission(user, permission)
  const canAny = (...permissionKeys: string[]) => permissionKeys.some(can)
  const isWorkspaceViewer =
    user?.workspace?.roleName === 'Viewer' ||
    user?.workspace?.roleName === 'Org Viewer' ||
    user?.tenantRoles?.includes('Viewer') === true
  const isViewOnly = (viewKey: string) => {
    if (!can(viewKey)) return false
    const prefix = viewKey.replace(/_VIEW$/, '')
    return !canAny(
      `${prefix}_CREATE`,
      `${prefix}_EDIT`,
      `${prefix}_MANAGE`,
      `${prefix}_SEND`,
      `${prefix}_INVITE`
    )
  }

  return { can, canAny, permissions, isViewOnly, isWorkspaceViewer }
}

export function useWorkspaceRole() {
  const { user } = useAuth()
  const { can } = usePermissions()

  const roleName = user?.workspace?.roleName ?? user?.tenantRoles?.[0] ?? null

  const isDriverRole =
    roleName === 'Driver' ||
    (can('DRIVER_DELIVERIES_VIEW') &&
      !can('ORDERS_VIEW') &&
      !can('CATALOG_VIEW') &&
      !can('FULFILLMENT_VIEW'))

  return { roleName, isDriverRole }
}

export type AppRoleNav = 'auth' | 'pending' | 'driver' | 'restaurant' | 'supplier' | 'consumer' | 'admin' | 'staff_deferred'

export function resolveAppRoleNav(user: ReturnType<typeof useAuth>['user']): AppRoleNav {
  if (!user) return 'auth'
  if (user.role === 'PENDING') return 'pending'
  if (user.role === 'STAFF_PORTAL') return 'staff_deferred'
  if (user.role === 'ADMIN') return 'admin'
  if (user.role === 'CONSUMER') return 'consumer'

  const can = (p: string) => userHasPermission(user, p)
  const roleName = user.workspace?.roleName ?? user.tenantRoles?.[0] ?? null
  const isDriver =
    roleName === 'Driver' ||
    (can('DRIVER_DELIVERIES_VIEW') && !can('ORDERS_VIEW') && !can('CATALOG_VIEW') && !can('FULFILLMENT_VIEW'))

  if (user.role === 'SUPPLIER' && isDriver) return 'driver'
  if (user.role === 'RESTAURANT') return 'restaurant'
  if (user.role === 'SUPPLIER') return 'supplier'
  return 'auth'
}
