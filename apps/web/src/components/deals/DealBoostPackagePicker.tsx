import { useEffect, useMemo } from 'react'
import { Badge } from '../ui/badge'
import { useGetPromotionPricingQuery } from '../../services/api'
import { Sparkles, TrendingUp, Zap } from 'lucide-react'

export type BoostPricingOption = {
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

export function DealBoostPackagePicker({
  selectedPricingKey,
  onSelect,
  disabled,
}: {
  selectedPricingKey: string
  onSelect: (pricingKey: string) => void
  disabled?: boolean
}) {
  const { data, isLoading } = useGetPromotionPricingQuery()
  const options = (data?.pricing || []) as BoostPricingOption[]

  const defaultKey = useMemo(() => {
    const recommended = options.find((o) => o.is_recommended)
    return recommended?.pricing_key || options[0]?.pricing_key || ''
  }, [options])

  useEffect(() => {
    if (!selectedPricingKey && defaultKey) {
      onSelect(defaultKey)
    }
  }, [defaultKey, onSelect, selectedPricingKey])

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading boost packages…</p>
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No boost packages available. Contact support.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)] rounded-md bg-[var(--surface-muted)] px-3 py-2">
        Your deal will get sponsored placement in restaurant deal feeds during the boost period.
        Reach labels describe placement priority, not exact impression counts.
      </p>
      <div className="grid gap-3">
        {options.map((opt, index) => {
          const Icon = PACKAGE_ICONS[index % PACKAGE_ICONS.length]
          const isSelected = selectedPricingKey === opt.pricing_key
          const days = opt.duration_days
          return (
            <button
              key={opt.pricing_key}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(opt.pricing_key)}
              className={`text-left rounded-xl border-2 p-4 transition-colors disabled:opacity-60 ${
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
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {days ? `${days} day${days === 1 ? '' : 's'}` : 'Boost period'}
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
                  <p className="text-lg font-bold tabular-nums">${Number(opt.amount).toFixed(0)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    one-time
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
