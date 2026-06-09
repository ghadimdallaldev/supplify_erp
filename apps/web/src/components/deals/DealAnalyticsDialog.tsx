import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { useGetPromotionAnalyticsQuery } from '../../services/api'
import { formatBoostStatusLabel } from '../../lib/dealDisplayLabels'
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
  const { data, isLoading } = useGetPromotionAnalyticsQuery(dealId!, { skip: !dealId })
  const a = data?.analytics as Record<string, unknown> | undefined
  const promo = a?.promotion as Record<string, unknown> | null | undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{promo ? 'Boost analytics' : 'Deal performance'}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Views" value={a?.views} />
            <Stat label="Clicks" value={a?.clicks} />
            <Stat label="Deal redemptions" value={a?.orders_influenced ?? a?.orders} />
            <Stat label="Messages" value={a?.messages} />
            <Stat label="Coupon uses" value={a?.couponUses} />
            <Stat
              label="Conversion"
              value={a?.conversionRate != null ? `${a.conversionRate}%` : '—'}
            />
            <Stat
              label="Discount amount"
              value={a?.total_discount != null ? `$${Number(a.total_discount).toFixed(2)}` : '—'}
            />
            {promo ? (
              <div className="col-span-2 text-xs text-[var(--text-muted)] border-t pt-2">
                Boost: {formatBoostStatusLabel(promo.status)} · budget $
                {Number(promo.budget || 0).toFixed(2)} · {String(promo.impressions || 0)}{' '}
                impressions · sponsored placement
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
