import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { useGetPromotionAnalyticsQuery } from '../../services/api'
import { formatBoostStatusLabel } from '../../lib/dealDisplayLabels'
import { formatPrice } from '../../utils/format'
import { ensureNamespace } from '../../i18n'
import { Loader2 } from 'lucide-react'

export function DealAnalyticsDialog({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('deals')
  const { data, isLoading } = useGetPromotionAnalyticsQuery(dealId!, { skip: !dealId })
  const a = data?.analytics as Record<string, unknown> | undefined
  const promo = a?.promotion as Record<string, unknown> | null | undefined

  useEffect(() => {
    void ensureNamespace('deals')
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {promo ? t('analytics.boostTitle') : t('analytics.performanceTitle')}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label={t('analytics.views')} value={a?.views} />
            <Stat label={t('analytics.clicks')} value={a?.clicks} />
            <Stat label={t('analytics.redemptions')} value={a?.orders_influenced ?? a?.orders} />
            <Stat label={t('analytics.messages')} value={a?.messages} />
            <Stat label={t('analytics.couponUses')} value={a?.couponUses} />
            <Stat
              label={t('analytics.conversion')}
              value={a?.conversionRate != null ? `${a.conversionRate}%` : '—'}
            />
            <Stat
              label={t('analytics.discountAmount')}
              value={a?.total_discount != null ? formatPrice(Number(a.total_discount)) : '—'}
            />
            {promo ? (
              <div className="col-span-2 text-xs text-[var(--text-muted)] border-t pt-2">
                {t('analytics.boostSummary', {
                  status: formatBoostStatusLabel(promo.status),
                  budget: Number(promo.budget || 0).toFixed(2),
                  impressions: String(promo.impressions || 0),
                })}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="font-semibold">{value != null ? String(value) : '0'}</p>
    </div>
  )
}
