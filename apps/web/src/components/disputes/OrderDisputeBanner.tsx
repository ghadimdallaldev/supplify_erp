import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Scale } from 'lucide-react'
import { Button } from '../ui/button'
import { getActiveDisputeForOrder, type DisputeLike } from '../../lib/disputeHelpers'
import { ensureNamespace } from '../../i18n'

type OrderDisputeBannerProps = {
  orderId: string
  disputes: DisputeLike[]
  isSupplier: boolean
}

function formatDisputeType(type: string, t: (key: string) => string): string {
  const key = `types.${type}`
  const translated = t(key)
  return translated === key ? type.replace(/_/g, ' ') : translated
}

function formatDisputeStatus(status: string, t: (key: string) => string): string {
  const key = `status.${status}`
  const translated = t(key)
  return translated === key ? status.replace(/_/g, ' ') : translated
}

export function OrderDisputeBanner({ orderId, disputes, isSupplier }: OrderDisputeBannerProps) {
  const { t } = useTranslation('disputes')

  useEffect(() => {
    void ensureNamespace('disputes')
  }, [])

  const active = getActiveDisputeForOrder(disputes, orderId)
  if (!active) return null

  const status = formatDisputeStatus(String(active.status ?? 'open'), t)
  const type = formatDisputeType(String(active.type ?? t('banner.defaultType')), t)
  const disputeId = String(active.id ?? '')

  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      data-testid="order-dispute-banner"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-2">
          <Scale className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <div>
            <strong>{t('banner.title')}</strong>
            <p className="mt-0.5 text-amber-900/90 dark:text-amber-200/90">
              {type} - {status}
              {isSupplier ? `. ${t('banner.supplierHint')}` : `. ${t('banner.restaurantHint')}`}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="border-amber-400" asChild>
          <Link to={disputeId ? `/app/disputes/${disputeId}` : '/app/disputes'}>
            {isSupplier ? t('banner.manageDispute') : t('banner.viewDispute')}
          </Link>
        </Button>
      </div>
      {disputeId && (
        <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-300/80 font-mono">
          {t('banner.ref', { id: disputeId.slice(0, 8).toUpperCase() })}
        </p>
      )}
    </div>
  )
}
