import { useTranslation } from 'react-i18next'
import { formatLimitValue } from '../../../lib/adminLimitLabels'

export type LocationMetric = {
  included?: number | null
  addonQuantity?: number
  effective?: number | null
  current?: number
  overIncludedLimit?: boolean
  overEffectiveLimit?: boolean
  atEnterpriseThreshold?: boolean
}

export function LocationMetricCard({
  title,
  metric,
  showEnterprise,
}: {
  title: string
  metric?: LocationMetric
  showEnterprise?: boolean
}) {
  const { t } = useTranslation('admin')

  if (!metric) return null

  const addonSuffix =
    (metric.addonQuantity ?? 0) > 0
      ? t('limits.location.addonSuffix', { count: metric.addonQuantity })
      : ''
  const effectiveSuffix =
    metric.effective != null
      ? t('limits.location.effectiveSuffix', { effective: metric.effective })
      : ''

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] p-4">
      <p className="font-medium text-[var(--text)]">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[var(--text-muted)]">{t('limits.location.included')}</dt>
          <dd className="font-medium">{formatLimitValue(metric.included)}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">{t('limits.location.addons')}</dt>
          <dd className="font-medium">{metric.addonQuantity ?? 0}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">{t('limits.location.effective')}</dt>
          <dd className="font-medium">{formatLimitValue(metric.effective)}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">{t('limits.location.inUse')}</dt>
          <dd className="font-medium">{metric.current ?? 0}</dd>
        </div>
      </dl>
      <p className="text-xs text-[var(--text-muted)]">
        {t('limits.location.usageSummary', {
          current: metric.current ?? 0,
          included: formatLimitValue(metric.included),
          addonSuffix,
          effectiveSuffix,
        })}
      </p>
      {metric.overIncludedLimit && !metric.overEffectiveLimit && (
        <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
          {t('limits.location.overIncludedLimit')}
        </span>
      )}
      {metric.overEffectiveLimit && (
        <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
          {t('limits.location.overEffectiveLimit')}
        </span>
      )}
      {showEnterprise && metric.atEnterpriseThreshold && (
        <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
          {t('limits.location.enterpriseThreshold')}
        </span>
      )}
    </div>
  )
}
