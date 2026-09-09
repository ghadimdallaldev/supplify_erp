/**
 * RBAC: check if the current user has a permission (for nav gating and UI).
 * Uses tenantPermissions when in tenant context, adminPermissions when on admin.
 * When admin is impersonating, uses the effective tenant permissions returned by the API.
 */
import { useAppSelector } from './redux'
import { useImpersonation } from './useImpersonation'
import { isTenantOwner } from '../lib/tenantRoles'

function hasPermission(permissions: string[] | undefined, required: string): boolean {
  if (!Array.isArray(permissions)) return false
  if (permissions.includes(required)) return true
  const manageKey = required.replace(/_VIEW$|_CREATE$|_EDIT$|_SEND$|_MANAGE$/, '_MANAGE')
  if (manageKey !== required && permissions.includes(manageKey)) return true
  return false
}

export function usePermissions() {
  const { user } = useAppSelector((state) => state.auth)
  const { isImpersonating } = useImpersonation()

  const can = (permissionKey: string): boolean => {
    if (!user) return false
    if (user.role === 'RESTAURANT' || user.role === 'SUPPLIER') {
      if (isTenantOwner(user)) return true
    }
    if (user.role === 'ADMIN') {
      if (isImpersonating) {
        return hasPermission(user.tenantPermissions, permissionKey)
      }
      return hasPermission(user.adminPermissions, permissionKey)
    }
    return hasPermission(user.tenantPermissions, permissionKey)
  }

  const canAny = (...permissionKeys: string[]): boolean => permissionKeys.some((key) => can(key))

  /** True for restaurant or supplier Viewer / Org Viewer — read-only by design. */
  const isWorkspaceViewer =
    user?.role === 'RESTAURANT' || user?.role === 'SUPPLIER'
      ? user?.workspace?.roleName === 'Viewer' ||
        user?.workspace?.roleName === 'Org Viewer' ||
        user?.tenantRoles?.includes('Viewer') === true
      : false

  /** True when user has view but none of the write/manage keys for the same domain. */
  const isViewOnly = (viewKey: string): boolean => {
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

  return { can, canAny, isViewOnly, isWorkspaceViewer }
}
