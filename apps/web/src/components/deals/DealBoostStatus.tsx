import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/badge'
import { ensureNamespace } from '../../i18n'
import { Rocket, Clock, AlertCircle } from 'lucide-react'

export type BoostStatus = {
  state: 'none' | 'active' | 'expired' | 'scheduled'
  packageName?: string
  startsAt?: string
  endsAt?: string
  daysRemaining?: number | null
  pricePaid?: number
}

export function DealBoostStatus({ boost }: { boost?: BoostStatus | null }) {
  const { t } = useTranslation('deals')

  useEffect(() => {
    void ensureNamespace('deals')
  }, [])

  if (!boost || boost.state === 'none') return null

  if (boost.state === 'active') {
    const endsLabel = boost.endsAt
      ? new Date(boost.endsAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Rocket className="h-4 w-4 text-emerald-600" />
          <span className="font-medium text-emerald-800 dark:text-emerald-200">
            {t('boostStatusCard.active', {
              packageName: boost.packageName || t('boostStatusCard.boostFallback'),
            })}
          </span>
          <Badge variant="secondary" className="text-xs">
            {boost.daysRemaining != null
              ? t('boostStatusCard.daysLeft', { count: boost.daysRemaining })
              : t('boostStatusCard.running')}
          </Badge>
        </div>
        {endsLabel ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t('boostStatusCard.activeUntil', { date: endsLabel })}
          </p>
        ) : null}
      </div>
    )
  }

  if (boost.state === 'scheduled') {
    return (
      <div className="rounded-lg border px-3 py-2 text-sm flex items-center gap-2">
        <Clock className="h-4 w-4 text-[var(--text-muted)]" />
        <span className="text-[var(--text-muted)]">
          {t('boostStatusCard.scheduled', { packageName: boost.packageName })}
          {boost.startsAt
            ? t('boostStatusCard.starts', {
                date: new Date(boost.startsAt).toLocaleDateString(),
              })
            : ''}
        </span>
      </div>
    )
  }

  if (boost.state === 'expired') {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-sm flex items-center gap-2 text-[var(--text-muted)]">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          {t('boostStatusCard.ended')}
          {boost.packageName ? ` (${boost.packageName})` : ''}
          {boost.endsAt
            ? t('boostStatusCard.expired', {
                date: new Date(boost.endsAt).toLocaleDateString(),
              })
            : ''}
        </span>
      </div>
    )
  }

  return null
}
