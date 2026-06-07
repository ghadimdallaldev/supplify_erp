import { Navigate } from 'react-router-dom'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { usePermissions } from '../hooks/usePermissions'

/** Default app home: drivers → deliveries; other suppliers → Command Center; restaurants → dashboard. */
export function SupplierHome() {
  const { isEffectiveSupplier, isPlatformAdmin, isImpersonating } = useImpersonation()
  const { isDriverRole } = useWorkspaceRole()
  const { canAny } = usePermissions()
  const isAdminNotImpersonating = isPlatformAdmin && !isImpersonating

  if (isEffectiveSupplier && !isAdminNotImpersonating) {
    if (isDriverRole) {
      return <Navigate to="/app/driver-deliveries" replace />
    }
    if (
      canAny(
        'ORDERS_MANAGE',
        'INVOICES_VIEW',
        'CATALOG_EDIT',
        'FULFILLMENT_VIEW',
        'PROMOTIONS_MANAGE'
      )
    ) {
      return <Navigate to="/app/command-center" replace />
    }
    if (canAny('FULFILLMENT_VIEW', 'DRIVER_DELIVERIES_VIEW')) {
      return <Navigate to="/app/fulfillment" replace />
    }
  }

  return <Navigate to="/app/dashboard" replace />
}
