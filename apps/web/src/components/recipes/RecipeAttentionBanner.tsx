import { AlertTriangle, ArrowRight, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

type RecipeAttentionBannerProps = {
  missingCount: number
  aboveTargetCount: number
  onViewMissing: () => void
  onViewAboveTarget: () => void
  onPriceImpact?: () => void
  className?: string
}

export function RecipeAttentionBanner({
  missingCount,
  aboveTargetCount,
  onViewMissing,
  onViewAboveTarget,
  onPriceImpact,
  className,
}: RecipeAttentionBannerProps) {
  const { t } = useTranslation('recipes')

  if (missingCount === 0 && aboveTargetCount === 0) return null

  const urgent = missingCount > 0
  const abovePart =
    aboveTargetCount > 0 ? t('attention.abovePart', { count: aboveTargetCount }) : ''

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        urgent
          ? 'border-[var(--red)]/30 bg-[var(--red-pale)]/50'
          : 'border-[var(--amber-mid)]/30 bg-[var(--amber-pale)]/40',
        className
      )}
      role="status"
      data-testid="recipe-attention-banner"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            urgent ? 'bg-[var(--red-pale)]' : 'bg-[var(--amber-pale)]'
          )}
        >
          <AlertTriangle
            className={cn('h-5 w-5', urgent ? 'text-[var(--red)]' : 'text-[var(--amber-mid)]')}
            aria-hidden
          />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-[var(--text)]">{t('attention.title')}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {urgent
              ? t('attention.missingAndAbove', { missing: missingCount, abovePart })
              : t(aboveTargetCount === 1 ? 'attention.aboveOnly' : 'attention.aboveOnly_plural', {
                  count: aboveTargetCount,
                })}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {missingCount > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={onViewMissing}>
            {t('attention.missingCost')}
          </Button>
        ) : null}
        {aboveTargetCount > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={onViewAboveTarget}>
            {t('attention.aboveTarget')}
          </Button>
        ) : null}
        {onPriceImpact ? (
          <Button type="button" size="sm" onClick={onPriceImpact}>
            <TrendingUp className="mr-1.5 h-4 w-4" />
            {t('attention.priceImpact')}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
