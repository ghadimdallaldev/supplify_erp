import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TableScroll } from '../../ui/table-scroll'
import { AdminEmptyState, AdminLoadingState } from '../adminUi'
import { UsageProgressBar } from '../UsageProgressBar'
import { UsageStatusBadge } from '../UsageStatusBadge'
import {
  filterAdminLimitKeys,
  formatLimitKeyLabel,
  formatLimitValue,
} from '../../../lib/adminLimitLabels'
import { computeUsageStatus } from '../../../lib/adminUsageStatus'
import type { Entitlements } from '../../../types/admin'

export function EffectiveLimitsTable({
  entitlements,
  tenantType,
  loading,
}: {
  entitlements?: Entitlements | null
  tenantType: 'RESTAURANT' | 'SUPPLIER'
  loading?: boolean
}) {
  const { t } = useTranslation('admin')
  const rows = useMemo(() => {
    if (!entitlements) return []
    const keys = filterAdminLimitKeys(Object.keys(entitlements.limits ?? {}), tenantType)
    return keys.map((key) => {
      const used = entitlements.usage?.[key] ?? 0
      const base = entitlements.baseLimits?.[key]
      const effective = entitlements.limits?.[key]
      const override = entitlements.overrides?.find((o) => o.limitKey === key)
      const status = computeUsageStatus(used, effective)
      return { key, used, base, effective, override, status }
    })
  }, [entitlements, tenantType])

  const atRiskCount = rows.filter(
    (r) => r.status === 'near_limit' || r.status === 'over_limit'
  ).length

  if (loading) {
    return <AdminLoadingState label={t('limits.loadingEffectiveLimits')} />
  }

  if (!entitlements) {
    return (
      <AdminEmptyState
        title={t('limits.noSubscriptionDataTitle')}
        description={t('limits.noSubscriptionDataDescription')}
      />
    )
  }

  if (rows.length === 0) {
    return (
      <AdminEmptyState
        title={t('limits.noLimitKeysTitle')}
        description={t('limits.noLimitKeysDescription')}
      />
    )
  }

  return (
    <div className="space-y-2" data-testid="admin-effective-limits-table">
      {atRiskCount > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          {t('limits.atRiskCount', { count: atRiskCount })}
        </p>
      )}
      <TableScroll aria-label={t('limits.effectiveLimitsTableAriaLabel')}>
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-start text-xs text-[var(--text-muted)]">
              <th className="px-3 py-2">{t('common.table.limit')}</th>
              <th className="px-3 py-2">{t('common.table.planBase')}</th>
              <th className="px-3 py-2">{t('common.table.override')}</th>
              <th className="px-3 py-2">{t('common.table.effective')}</th>
              <th className="px-3 py-2">{t('common.table.inUse')}</th>
              <th className="px-3 py-2">{t('common.table.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-[var(--brand-ultra)]/30">
                <td className="px-3 py-2 font-medium">{formatLimitKeyLabel(row.key)}</td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{formatLimitValue(row.base)}</td>
                <td className="px-3 py-2 text-[var(--text-muted)]">
                  {row.override ? (
                    <span title={row.override.reason ?? undefined}>
                      {row.override.value}
                      <span className="ms-1 text-[10px] uppercase">({row.override.scope})</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 font-medium">{formatLimitValue(row.effective)}</td>
                <td className="px-3 py-2 min-w-[140px]">
                  <div className="text-xs">
                    {row.used} / {formatLimitValue(row.effective)}
                  </div>
                  {row.effective != null && row.effective !== -1 && (
                    <UsageProgressBar used={row.used} limit={row.effective} status={row.status} />
                  )}
                </td>
                <td className="px-3 py-2">
                  <UsageStatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  )
}
