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
  if (!metric) return null
  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] p-4">
      <p className="font-medium text-[var(--text)]">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[var(--text-muted)]">Included</dt>
          <dd className="font-medium">{formatLimitValue(metric.included)}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Add-ons</dt>
          <dd className="font-medium">{metric.addonQuantity ?? 0}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Effective</dt>
          <dd className="font-medium">{formatLimitValue(metric.effective)}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">In use</dt>
          <dd className="font-medium">{metric.current ?? 0}</dd>
        </div>
      </dl>
      <p className="text-xs text-[var(--text-muted)]">
        Usage: {metric.current ?? 0} / {formatLimitValue(metric.included)} included
        {(metric.addonQuantity ?? 0) > 0 ? `, +${metric.addonQuantity} add-on` : ''}
        {metric.effective != null ? ` → effective ${metric.effective}` : ''}
      </p>
      {metric.overIncludedLimit && !metric.overEffectiveLimit && (
        <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
          Over included limit (within effective cap)
        </span>
      )}
      {metric.overEffectiveLimit && (
        <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
          Over effective limit
        </span>
      )}
      {showEnterprise && metric.atEnterpriseThreshold && (
        <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
          At Enterprise threshold (6+ branches)
        </span>
      )}
    </div>
  )
}
