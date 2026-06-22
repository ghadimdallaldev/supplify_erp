import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useGetOrgQuery } from '../services/api'
import { useAppSelector } from '../hooks/redux'
import { useEntitlements } from '../hooks/useEntitlements'
import { multiBranchEnabled } from '../lib/planLimits'
import { BranchInvitationsPanel } from '../components/org/BranchInvitationsPanel'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { ensureNamespace } from '../i18n'

export function BranchDetailPage() {
  const { t } = useTranslation('branches')
  const { supplierId } = useParams<{ supplierId: string }>()
  const { user } = useAppSelector((state) => state.auth)
  const { entitlements } = useEntitlements()
  const multiBranch = multiBranchEnabled(entitlements)
  const { data, isLoading } = useGetOrgQuery(undefined, { skip: user?.role !== 'SUPPLIER' })

  useEffect(() => {
    void ensureNamespace('branches')
  }, [])

  const branch = data?.branches?.find((b) => (b as { id: string }).id === supplierId) as
    | { id: string; name: string }
    | undefined

  if (!multiBranch) {
    return (
      <PageShell data-testid="branch-detail-page">
        <PageHeader title={t('detail.title')} description={t('detail.notEnabled')} />
        <Link to="/app/settings?tab=subscription" className="text-sm underline inline-block">
          {t('detail.viewSubscription')}
        </Link>
      </PageShell>
    )
  }

  if (isLoading) {
    return (
      <PageShell data-testid="branch-detail-page">
        <p className="text-sm text-[var(--text-muted)]">{t('detail.loading')}</p>
      </PageShell>
    )
  }

  if (!branch || !supplierId) {
    return (
      <PageShell data-testid="branch-detail-page">
        <PageHeader title={t('detail.title')} description={t('detail.notFound')} />
        <Link to="/app/org" className="text-sm underline inline-block">
          {t('detail.backToOrg')}
        </Link>
      </PageShell>
    )
  }

  return (
    <PageShell data-testid="branch-detail-page">
      <PageHeader
        title={branch.name}
        description={t('detail.settingsDescription')}
        breadcrumb={
          <Link to="/app/org" className="text-sm text-[var(--brand)] hover:underline">
            {t('detail.organization')}
          </Link>
        }
      />
      <BranchInvitationsPanel supplierId={supplierId} branchName={branch.name} />
    </PageShell>
  )
}
