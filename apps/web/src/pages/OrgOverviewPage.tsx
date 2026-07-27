import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Plus, Settings } from 'lucide-react'
import { RestaurantOrgOverviewPage } from './RestaurantOrgOverviewPage'
import { Link, useNavigate } from 'react-router-dom'
import {
  useGetOrgQuery,
  useGetOrgReportsOverviewQuery,
  useSwitchOrgBranchContextMutation,
} from '../services/api'
import { useImpersonation } from '../hooks/useImpersonation'
import { usePermissions } from '../hooks/usePermissions'
import { RequirePermission } from '../components/RequirePermission'
import { useEntitlements } from '../hooks/useEntitlements'
import { multiBranchEnabled } from '../lib/planLimits'
import { AddBranchModal } from '../components/org/AddBranchModal'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { ensureNamespace } from '../i18n'

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

export function OrgOverviewPage() {
  const { t } = useTranslation('reports')

  useEffect(() => {
    void ensureNamespace('reports')
  }, [])

  const { isEffectiveRestaurant, isEffectiveSupplier } = useImpersonation()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const { entitlements } = useEntitlements()
  const multiBranch = multiBranchEnabled(entitlements)
  const { data, isLoading } = useGetOrgQuery(undefined, {
    skip: !isEffectiveSupplier,
  })
  const { data: reports } = useGetOrgReportsOverviewQuery(undefined, {
    skip: !isEffectiveSupplier || !multiBranch,
  })
  const [addBranchOpen, setAddBranchOpen] = useState(false)
  const [switchBranch] = useSwitchOrgBranchContextMutation()

  if (isEffectiveRestaurant) {
    return (
      <RequirePermission permission="SETTINGS_VIEW" title="organization">
        <RestaurantOrgOverviewPage />
      </RequirePermission>
    )
  }

  const orgRole = data?.orgRole
  const canManageOrg = can('SETTINGS_MANAGE')

  const branches = data?.branches ?? []
  const kpis = reports?.kpis
  const byBranch = reports?.by_branch ?? []
  const spendById = new Map(
    byBranch.map((row) => [String(row.branch_account_id), Number(row.total_revenue || 0)])
  )

  const handleOpenBranch = async (supplierId: string) => {
    await switchBranch({ supplier_id: supplierId }).unwrap()
    navigate('/app/dashboard')
    window.location.reload()
  }

  if (isEffectiveSupplier && !multiBranch && !isLoading) {
    navigate('/app/dashboard', { replace: true })
    return null
  }

  if (!multiBranch) {
    return (
      <RequirePermission permission="SETTINGS_VIEW" title="organization">
        <PageShell data-testid="org-overview-page">
          <PageHeader title={t('org.title')} description={t('org.upgradeDescription')} />
          <Link to="/app/settings?tab=subscription" className="text-sm underline inline-block">
            {t('org.viewSubscription')}
          </Link>
        </PageShell>
      </RequirePermission>
    )
  }

  return (
    <RequirePermission permission="SETTINGS_VIEW" title="organization">
      <PageShell data-testid="org-overview-page">
        <PageHeader
          title={data?.organization?.name ?? t('org.title')}
          description={t('org.branchCount', {
            count: branches.length,
            role: orgRole ?? '',
          })}
          actions={
            canManageOrg ? (
              <button
                type="button"
                onClick={() => setAddBranchOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] text-white px-3 py-2 text-sm"
              >
                <Plus className="h-4 w-4" />
                {t('org.addBranchAccount')}
              </button>
            ) : undefined
          }
        />

        {kpis ? (
          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            <div className="rounded-lg border border-[var(--app-border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Orders (period)</p>
              <p className="text-2xl font-semibold mt-1">{kpis.order_count}</p>
            </div>
            <div className="rounded-lg border border-[var(--app-border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Revenue (period)</p>
              <p className="text-2xl font-semibold mt-1">
                {formatMoney(Number(kpis.total_revenue || 0))}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--app-border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Active Branch Accounts</p>
              <p className="text-2xl font-semibold mt-1">{kpis.active_branch_accounts}</p>
            </div>
          </div>
        ) : null}

        {isLoading && (
          <p className="text-sm text-[var(--text-muted)]">{t('org.loadingBranches')}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {branches.map((branch) => {
            const b = branch as {
              id: string
              name: string
              is_main_branch?: boolean
              is_branch_active?: boolean
              staff_count?: number
              order_count?: number
            }
            return (
              <div
                key={b.id}
                className="rounded-lg border border-[var(--app-border)] p-4 hover:border-[var(--primary)] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {b.name}
                      {b.is_main_branch && (
                        <span className="text-xs rounded bg-[var(--surface-muted)] px-1.5 py-0.5">
                          {t('org.main')}
                        </span>
                      )}
                      {b.is_branch_active === false && (
                        <span className="text-xs rounded bg-amber-100 text-amber-900 px-1.5 py-0.5">
                          {t('org.inactive')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {t('org.staffOrders', {
                        staff: b.staff_count ?? 0,
                        orders: b.order_count ?? 0,
                      })}
                      {spendById.has(b.id)
                        ? ` · ${formatMoney(Number(spendById.get(b.id) ?? 0))} revenue`
                        : ''}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-3 text-sm">
                      <button
                        type="button"
                        className="text-[var(--brand)] hover:underline"
                        onClick={() => handleOpenBranch(b.id).catch(() => {})}
                      >
                        {t('org.openBranch')}
                      </button>
                      {canManageOrg && (
                        <Link
                          to={`/app/org/branches/${b.id}`}
                          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand)]"
                        >
                          <Settings className="h-3.5 w-3.5" />
                          {t('org.invitations')}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {canManageOrg && (
          <AddBranchModal open={addBranchOpen} onClose={() => setAddBranchOpen(false)} />
        )}
      </PageShell>
    </RequirePermission>
  )
}
