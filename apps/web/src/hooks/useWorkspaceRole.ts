/**
 * Workspace role helpers for nav and home redirects.
 */
import { useMemo } from 'react'
import { useAppSelector } from './redux'
import { usePermissions } from './usePermissions'
import { useImpersonation } from './useImpersonation'
import { resolveWorkspacePersona } from '../lib/workspaceRoleProfile'

export function useWorkspaceRole() {
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const { isEffectiveSupplier, isEffectiveRestaurant } = useImpersonation()

  const roleName = user?.workspace?.roleName || user?.tenantRoles?.[0] || null

  const isDriverRole =
    roleName === 'Driver' ||
    (can('DRIVER_DELIVERIES_VIEW') &&
      !can('ORDERS_VIEW') &&
      !can('CATALOG_VIEW') &&
      !can('FULFILLMENT_VIEW'))

  const isReadOnlyViewer =
    roleName === 'Viewer' ||
    roleName === 'Org Viewer' ||
    user?.tenantRoles?.includes('Viewer') === true

  const tenantType = isEffectiveSupplier
    ? ('SUPPLIER' as const)
    : isEffectiveRestaurant
      ? ('RESTAURANT' as const)
      : user?.role === 'SUPPLIER'
        ? ('SUPPLIER' as const)
        : user?.role === 'RESTAURANT'
          ? ('RESTAURANT' as const)
          : null

  const persona = useMemo(
    () =>
      resolveWorkspacePersona({
        tenantType,
        roleName,
        can,
        isDriver: isDriverRole,
      }),
    [tenantType, roleName, can, isDriverRole]
  )

  return { roleName, isDriverRole, isReadOnlyViewer, persona, tenantType }
}
