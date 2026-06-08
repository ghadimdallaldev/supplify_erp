import { Navigate } from 'react-router-dom'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'

/** Default app home tailored to workspace role persona. */
export function SupplierHome() {
  const { isEffectiveSupplier, isPlatformAdmin, isImpersonating } = useImpersonation()
  const { persona } = useWorkspaceRole()
  const isAdminNotImpersonating = isPlatformAdmin && !isImpersonating

  if (isEffectiveSupplier && !isAdminNotImpersonating) {
    return <Navigate to={persona.homePath} replace />
  }

  return <Navigate to={persona.homePath} replace />
}
