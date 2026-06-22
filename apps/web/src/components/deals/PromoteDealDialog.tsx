import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Badge } from '../ui/badge'
import { useGetPromotionPricingQuery, usePromoteDealMutation } from '../../services/api'
import { ensureNamespace } from '../../i18n'
import { Megaphone, Sparkles, TrendingUp, Zap } from 'lucide-react'
import { toast } from 'sonner'

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
  const { t } = useTranslation('deals')
  const { data: pricingData, isLoading: loadingPricing } = useGetPromotionPricingQuery(undefined, {
    skip: !open,
  })
  const [promoteDeal, { isLoading }] = usePromoteDealMutation()
  const pricingOptions = useMemo(
    () => (pricingData?.pricing || []) as PricingOption[],
    [pricingData?.pricing]
  )

  const defaultKey = useMemo(() => {
    const recommended = pricingOptions.find((o) => o.is_recommended)
    return recommended?.pricing_key || pricingOptions[0]?.pricing_key || ''
  }, [pricingOptions])

  const [selectedPricingKey, setSelectedPricingKey] = useState('')

  useEffect(() => {
    void ensureNamespace('deals')
  }, [])

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
      toast.success(t('promoteDialog.toastSuccess'))
      onOpenChange(false)
      onSuccess?.()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('promoteDialog.toastError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            {t('promoteDialog.title')}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[var(--text-muted)]">{t('promoteDialog.description')}</p>

        <p className="text-xs text-[var(--text-muted)] rounded-md bg-[var(--surface-muted)] px-3 py-2">
          {t('promoteDialog.helperText')}
        </p>

        {loadingPricing ? (
          <p className="text-sm text-[var(--text-muted)] py-4">{t('promoteDialog.loading')}</p>
        ) : pricingOptions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-4">
            {t('promoteDialog.noneAvailable')}
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
                  className={`text-start rounded-xl border-2 p-4 transition-colors ${
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
                            <Badge>{t('promoteDialog.recommended')}</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {days
                            ? t('promoteDialog.daysBoost', { count: days })
                            : t('promoteDialog.boostPeriod')}
                          {opt.estimated_reach_label ? ` · ${opt.estimated_reach_label}` : ''}
                        </p>
                        {opt.description ? (
                          <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                            {opt.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-lg font-bold tabular-nums">
                        ${Number(opt.amount).toFixed(0)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        {t('promoteDialog.oneTime')}
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
            <p className="font-medium">
              {t('promoteDialog.boostingWith', { name: selected.display_name })}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {selected.duration_days
                ? t('promoteDialog.priceForDays', {
                    amount: Number(selected.amount).toFixed(2),
                    count: selected.duration_days,
                  })
                : t('promoteDialog.priceForPeriod', {
                    amount: Number(selected.amount).toFixed(2),
                  })}
              {selected.estimated_reach_label ? ` · ${selected.estimated_reach_label}` : ''}
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('promoteDialog.cancel')}
          </Button>
          <Button
            onClick={handlePromote}
            disabled={isLoading || !selectedPricingKey || pricingOptions.length === 0}
          >
            <Megaphone className="h-4 w-4 me-2" />
            {t('promoteDialog.boostDeal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
