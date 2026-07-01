import { AlertCircle, ChefHat, Package, TrendingDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { formatRecipeShare, summaryCardClass } from './recipeShared'

export type RecipeSummaryFilter =
  | 'ALL'
  | 'HEALTHY'
  | 'WARNING'
  | 'MISSING_DATA'
  | 'missingCost'
  | 'aboveTarget'
  | 'recentlyImpacted'

type RecipeSummaryCardsProps = {
  total: number
  healthy: number
  aboveTarget: number
  missingData: number
  activeFilter: RecipeSummaryFilter
  onFilter: (filter: RecipeSummaryFilter) => void
}

export function RecipeSummaryCards({
  total,
  healthy,
  aboveTarget,
  missingData,
  activeFilter,
  onFilter,
}: RecipeSummaryCardsProps) {
  const { t } = useTranslation('recipes')

  const cards: Array<{
    key: RecipeSummaryFilter
    label: string
    value: number
    sub?: string
    valueClass?: string
    icon: typeof Package
    iconWrap: string
    iconClass: string
  }> = [
    {
      key: 'ALL',
      label: t('summary.totalRecipes'),
      value: total,
      sub: t('summary.activeMenuItems'),
      icon: ChefHat,
      iconWrap: 'bg-[var(--brand-pale)]',
      iconClass: 'text-[var(--brand-mid)]',
    },
    {
      key: 'HEALTHY',
      label: t('summary.onTarget'),
      value: healthy,
      sub: t('summary.shareOfTotal', { share: formatRecipeShare(healthy, total) }),
      valueClass: 'text-[var(--mint)]',
      icon: Package,
      iconWrap: 'bg-[var(--mint-pale)]',
      iconClass: 'text-[var(--mint)]',
    },
    {
      key: 'aboveTarget',
      label: t('summary.aboveTargetFc'),
      value: aboveTarget,
      sub: t('summary.shareOfTotal', { share: formatRecipeShare(aboveTarget, total) }),
      valueClass: 'text-[var(--amber)]',
      icon: AlertCircle,
      iconWrap: 'bg-[var(--amber-pale)]',
      iconClass: 'text-[var(--amber-mid)]',
    },
    {
      key: 'missingCost',
      label: t('summary.missingCost'),
      value: missingData,
      sub: t('summary.shareOfTotal', { share: formatRecipeShare(missingData, total) }),
      valueClass: 'text-[var(--red)]',
      icon: TrendingDown,
      iconWrap: 'bg-[var(--red-pale)]',
      iconClass: 'text-[var(--red)]',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        const isActive =
          (card.key === 'ALL' && activeFilter === 'ALL') ||
          (card.key === 'HEALTHY' && activeFilter === 'HEALTHY') ||
          (card.key === 'missingCost' &&
            (activeFilter === 'missingCost' || activeFilter === 'MISSING_DATA')) ||
          (card.key === 'aboveTarget' &&
            (activeFilter === 'aboveTarget' || activeFilter === 'WARNING'))
        return (
          <Card
            key={card.key}
            className={summaryCardClass(isActive)}
            onClick={() => onFilter(card.key)}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onFilter(card.key)
              }
            }}
          >
            <CardContent className="p-4 sm:pt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">
                    {card.label}
                  </p>
                  <p
                    className={`text-xl font-bold sm:text-2xl ${card.valueClass ?? 'text-[var(--text)]'}`}
                  >
                    {card.value}
                  </p>
                  {card.sub ? (
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)] sm:text-xs">
                      {card.sub}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 ${card.iconWrap}`}
                >
                  <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${card.iconClass}`} />
                </span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
