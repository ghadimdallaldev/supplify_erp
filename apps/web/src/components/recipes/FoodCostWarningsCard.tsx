import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { useGetFoodCostWarningsQuery } from '../../services/api/endpoints/priceIntelligence'

/**
 * Intelligence-tier food-cost breaches, with the ingredient price change that
 * caused each one. The caller decides whether the tenant is entitled; this
 * component assumes it may query.
 *
 * Deliberately distinct from the dashboard's "lowest margin" card: that is a
 * descriptive top-5 available with recipe costing, this is a threshold-based
 * breach list against each recipe's own target, with attribution.
 */
export function FoodCostWarningsCard() {
  const { t } = useTranslation('recipes')
  const { data, isLoading, isError } = useGetFoodCostWarningsQuery()

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />
  if (isError) return null

  const warnings = data?.warnings ?? []
  const coverage = data?.coverage

  return (
    <Card data-testid="food-cost-warnings-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {t('foodCostWarnings.title')}
        </CardTitle>
        <CardDescription>{t('foodCostWarnings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {warnings.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('foodCostWarnings.empty')}</p>
        ) : (
          <ul className="grid gap-3">
            {warnings.map((warning) => (
              <li key={warning.recipeId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{warning.recipeName}</span>
                  <Badge variant="destructive">
                    {warning.overagePct != null
                      ? t('foodCostWarnings.overBy', { pct: warning.overagePct.toFixed(1) })
                      : '—'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('foodCostWarnings.actualVsTarget', {
                    actual: warning.foodCostPct?.toFixed(1) ?? '—',
                    target: warning.targetFoodCostPct?.toFixed(1) ?? '—',
                  })}
                </p>
                {warning.lastIngredientChange ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('foodCostWarnings.drivenBy', {
                      ingredient: warning.lastIngredientChange.ingredientName ?? '—',
                      pct: warning.lastIngredientChange.costDiffPct?.toFixed(1) ?? '—',
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* An empty list is not the same as "everything is healthy". */}
        {coverage && (coverage.withoutTarget > 0 || coverage.missingCostData > 0) ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t('foodCostWarnings.coverage', {
              withoutTarget: coverage.withoutTarget,
              missingCostData: coverage.missingCostData,
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
