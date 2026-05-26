/**
 * RBAC: check if the current user has a permission (for nav gating and UI).
 * Uses tenantPermissions when in tenant context, adminPermissions when on admin.
 * When admin is impersonating, allows all tenant permissions so the UI matches backend access.
 */
import { useAppSelector } from './redux'
import { useGetImpersonationStatusQuery } from '../services/api'

function hasPermission(permissions: string[] | undefined, required: string): boolean {
  if (!Array.isArray(permissions)) return false
  if (permissions.includes(required)) return true
  const manageKey = required.replace(/_VIEW$|_CREATE$|_EDIT$|_SEND$|_MANAGE$/, '_MANAGE')
  if (manageKey !== required && permissions.includes(manageKey)) return true
  return false
}

export function usePermissions() {
  const { user } = useAppSelector((state) => state.auth)
  const { data: impersonation } = useGetImpersonationStatusQuery(undefined, {
    skip: user?.role !== 'ADMIN',
  })

  const isImpersonating = user?.role === 'ADMIN' && impersonation?.active

  const can = (permissionKey: string): boolean => {
    if (!user) return false
    if (isImpersonating) return true
    if (user.role === 'ADMIN') {
      return hasPermission(user.adminPermissions, permissionKey)
    }
    return hasPermission(user.tenantPermissions, permissionKey)
  }

  const canAny = (...permissionKeys: string[]): boolean => permissionKeys.some((key) => can(key))

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

  return { can, canAny, isViewOnly }
}
