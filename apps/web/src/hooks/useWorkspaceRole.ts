/**
 * Workspace role helpers for nav and home redirects.
 */
import { useAppSelector } from './redux'
import { usePermissions } from './usePermissions'

export function useWorkspaceRole() {
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()

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

  return { roleName, isDriverRole, isReadOnlyViewer }
}
