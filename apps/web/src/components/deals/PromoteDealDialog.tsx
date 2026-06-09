import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Badge } from '../ui/badge'
import { useGetPromotionPricingQuery, usePromoteDealMutation } from '../../services/api'
import { Megaphone, Sparkles, TrendingUp, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

type PricingOption = {
  pricing_key: string
  display_name: string
  amount: number
  duration_days?: number | null
  description?: string | null
  estimated_reach_label?: string | null
  badge_label?: string | null
  is_recommended?: boolean
}

const PACKAGE_ICONS = [Zap, TrendingUp, Sparkles]

export function PromoteDealDialog({
  dealId,
  open,
  onOpenChange,
  onSuccess,
}: {
  dealId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const { data: pricingData, isLoading: loadingPricing } = useGetPromotionPricingQuery(undefined, {
    skip: !open,
  })
  const [promoteDeal, { isLoading }] = usePromoteDealMutation()
  const pricingOptions = (pricingData?.pricing || []) as PricingOption[]

  const defaultKey = useMemo(() => {
    const recommended = pricingOptions.find((o) => o.is_recommended)
    return recommended?.pricing_key || pricingOptions[0]?.pricing_key || ''
  }, [pricingOptions])

  const [selectedPricingKey, setSelectedPricingKey] = useState('')

  useEffect(() => {
    if (open && defaultKey) {
      setSelectedPricingKey(defaultKey)
    }
  }, [open, defaultKey])

  const selected = pricingOptions.find((o) => o.pricing_key === selectedPricingKey)

  const handlePromote = async () => {
    if (!dealId || !selectedPricingKey) return
    try {
      await promoteDeal({ id: dealId, pricingKey: selectedPricingKey }).unwrap()
      toast.success('Deal boost activated')
      onOpenChange(false)
      onSuccess?.()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to boost deal')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Boost this deal
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[var(--text-muted)]">
          Choose a boost package for sponsored placement in restaurant deal feeds — including
          restaurants that do not follow you yet.
        </p>

        <p className="text-xs text-[var(--text-muted)] rounded-md bg-[var(--surface-muted)] px-3 py-2">
          Your deal will appear higher in restaurant deal feeds during the boost period. Reach
          estimates describe placement priority, not exact impression counts.
        </p>

        {loadingPricing ? (
          <p className="text-sm text-[var(--text-muted)] py-4">Loading boost packages…</p>
        ) : pricingOptions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-4">
            No boost packages are available right now. Contact support or try again later.
          </p>
        ) : (
          <div className="grid gap-3 mt-1">
            {pricingOptions.map((opt, index) => {
              const Icon = PACKAGE_ICONS[index % PACKAGE_ICONS.length]
              const isSelected = selectedPricingKey === opt.pricing_key
              const days = opt.duration_days
              return (
                <button
                  key={opt.pricing_key}
                  type="button"
                  onClick={() => setSelectedPricingKey(opt.pricing_key)}
                  className={`text-left rounded-xl border-2 p-4 transition-colors ${
                    isSelected
                      ? 'border-[var(--brand)] bg-[var(--brand)]/5'
                      : 'border-[var(--app-border)] hover:border-[var(--brand)]/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3 min-w-0">
                      <div
                        className={`mt-0.5 rounded-lg p-2 shrink-0 ${
                          isSelected ? 'bg-[var(--brand)]/15' : 'bg-[var(--surface-muted)]'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sm">{opt.display_name}</p>
                          {opt.badge_label ? (
                            <Badge variant={opt.is_recommended ? 'default' : 'secondary'}>
                              {opt.badge_label}
                            </Badge>
                          ) : null}
                          {opt.is_recommended && !opt.badge_label ? (
                            <Badge>Recommended</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {days ? `${days} day${days === 1 ? '' : 's'} boost` : 'Boost period'}
                          {opt.estimated_reach_label ? ` · ${opt.estimated_reach_label}` : ''}
                        </p>
                        {opt.description ? (
                          <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                            {opt.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold tabular-nums">
                        ${Number(opt.amount).toFixed(0)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        one-time
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {selected ? (
          <div className="rounded-lg border border-dashed p-3 text-sm">
            <p className="font-medium">You are boosting with {selected.display_name}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              ${Number(selected.amount).toFixed(2)} for{' '}
              {selected.duration_days
                ? `${selected.duration_days} day${selected.duration_days === 1 ? '' : 's'}`
                : 'the boost period'}
              {selected.estimated_reach_label ? ` · ${selected.estimated_reach_label}` : ''}
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePromote}
            disabled={isLoading || !selectedPricingKey || pricingOptions.length === 0}
          >
            <Megaphone className="h-4 w-4 mr-2" />
            Boost deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
