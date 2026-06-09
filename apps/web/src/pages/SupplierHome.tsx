import { Navigate } from 'react-router-dom'
import { PageLoading } from '../components/ui/page-loading'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'

/** Default app home tailored to workspace role persona. */
export function SupplierHome() {
  const {
    isEffectiveSupplier,
    isPlatformAdmin,
    isImpersonating,
    isLoading: impersonationLoading,
  } = useImpersonation()
  const { persona } = useWorkspaceRole()

  if (isPlatformAdmin) {
    if (impersonationLoading) {
      return <PageLoading label="Loading…" />
    }
    if (!isImpersonating) {
      return <Navigate to="/app/admin" replace />
    }
  }

  if (isEffectiveSupplier) {
    return <Navigate to={persona.homePath} replace />
  }

  return <Navigate to={persona.homePath} replace />
}
