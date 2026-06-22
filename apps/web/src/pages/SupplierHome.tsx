import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { PageLoading } from '../components/ui/page-loading'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { ensureNamespace } from '../i18n'

/** Default app home tailored to workspace role persona. */
export function SupplierHome() {
  const { t } = useTranslation('supplierOps')

  useEffect(() => {
    void ensureNamespace('supplierOps')
  }, [])
  const {
    isEffectiveSupplier,
    isPlatformAdmin,
    isImpersonating,
    isLoading: impersonationLoading,
  } = useImpersonation()
  const { persona } = useWorkspaceRole()

  if (isPlatformAdmin) {
    if (impersonationLoading) {
      return <PageLoading label={t('home.loading')} />
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
