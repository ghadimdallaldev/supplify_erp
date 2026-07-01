import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, Edit, Printer, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { KpiCard } from '../../components/ui/kpi-card'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { RecipeStatusBadge } from '../../components/recipes/RecipeStatusBadge'
import { FoodCostBar } from '../../components/recipes/FoodCostBar'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useDuplicateRecipeMutation,
  useGetRecipeCostBreakdownQuery,
  useGetRecipeQuery,
  useRecalculateRecipeMutation,
} from '../../services/api/endpoints/recipes'
import { formatPrice } from '../../utils/format'
import { getApiBase } from '../../lib/env'
import { cn } from '../../lib/utils'
import { Skeleton } from '../../components/ui/skeleton'
import { ensureNamespace } from '../../i18n'

export function RecipeDetailPage() {
  const { t } = useTranslation('recipes')
  const { t: tCommon } = useTranslation('common')
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canViewCosts = can('RECIPES_VIEW_COSTS')
  const canEdit = can('RECIPES_EDIT') || can('RECIPES_MANAGE')

  const { data, isLoading, isError, refetch } = useGetRecipeQuery(id!, { skip: !id })
  const { data: breakdownData } = useGetRecipeCostBreakdownQuery(id!, {
    skip: !id || !canViewCosts,
  })
  const [recalculate, { isLoading: recalculating }] = useRecalculateRecipeMutation()
  const [duplicate, { isLoading: duplicating }] = useDuplicateRecipeMutation()

  useEffect(() => {
    void ensureNamespace('recipes')
  }, [])

  const recipe = data?.recipe

  if (isLoading) {
    return (
      <PageShell maxWidth="wide">
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      </PageShell>
    )
  }

  if (isError || !recipe) {
    return (
      <PageShell>
        <p className="p-6 text-destructive">{t('detail.notFound')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          {tCommon('actions.retry')}
        </Button>
      </PageShell>
    )
  }

  const breakdown = breakdownData?.breakdown as
    | {
        ingredients?: Array<Record<string, unknown>>
        warnings?: string[]
        totalRecipeCost?: number | string
      }
    | undefined

  const ingredients = breakdown?.ingredients || recipe.ingredients || []
  const totalRecipeCost =
    breakdown?.totalRecipeCost != null ? Number(breakdown.totalRecipeCost) : null

  return (
    <RequirePermission permission="RECIPES_VIEW" title={t('permission.detail')}>
      <PageShell maxWidth="wide" data-testid="recipe-detail-page">
        <PageHeader
          title={recipe.name}
          description={
            [recipe.category, recipe.internalCode].filter(Boolean).join(' · ') ||
            t('detail.titleFallback')
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a
                  href={`${getApiBase()}/api/recipes/${recipe.id}/print`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {t('detail.print')}
                </a>
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/app/recipes/${recipe.id}/edit`)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {t('detail.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={duplicating}
                    onClick={async () => {
                      const res = await duplicate(recipe.id).unwrap()
                      toast.success(t('toasts.duplicated'))
                      navigate(`/app/recipes/${res.recipe.id}/edit`)
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('detail.duplicate')}
                  </Button>
                  <Button
                    disabled={recalculating}
                    onClick={async () => {
                      await recalculate(recipe.id).unwrap()
                      toast.success(t('toasts.recalculated'))
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('detail.recalculate')}
                  </Button>
                </>
              )}
            </div>
          }
        />

        {recipe.alerts && recipe.alerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {recipe.alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-lg border border-[var(--amber-mid)]/30 bg-[var(--amber-pale)]/40 px-3 py-2 text-sm text-[var(--text)]"
              >
                {alert.message}
              </div>
            ))}
          </div>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 sm:p-5">
            <p className="mb-2 text-xs font-medium text-[var(--text-mid)]">{t('detail.status')}</p>
            <RecipeStatusBadge status={recipe.calcStatus} />
          </Card>
          {canViewCosts && (
            <>
              <KpiCard
                label={t('detail.costPerPortion')}
                value={
                  recipe.costPerPortion != null
                    ? formatPrice(recipe.costPerPortion)
                    : t('detail.missing')
                }
                description={t(
                  recipe.portionCount === 1 ? 'detail.portions' : 'detail.portions_plural',
                  { count: recipe.portionCount }
                )}
                icon={Copy}
                tone={recipe.costPerPortion != null ? 'brand' : 'danger'}
                size="sm"
              />
              <Card className="sm:col-span-2 lg:col-span-1">
                <CardContent className="p-4 sm:p-5">
                  <p className="mb-2 text-xs font-medium text-[var(--text-mid)]">
                    {t('detail.foodCostPct')}
                  </p>
                  <p className="mb-2 text-2xl font-bold tabular-nums">
                    {recipe.foodCostPct != null ? `${recipe.foodCostPct.toFixed(1)}%` : '—'}
                  </p>
                  <FoodCostBar
                    foodCostPct={recipe.foodCostPct}
                    targetFoodCostPct={recipe.targetFoodCostPct}
                    calcStatus={recipe.calcStatus}
                  />
                </CardContent>
              </Card>
              <KpiCard
                label={t('detail.grossMargin')}
                value={recipe.grossMarginPct != null ? `${recipe.grossMarginPct.toFixed(1)}%` : '—'}
                description={
                  recipe.suggestedSellingPrice != null
                    ? t('detail.suggestedPrice', {
                        price: formatPrice(recipe.suggestedSellingPrice),
                      })
                    : recipe.sellingPrice != null
                      ? t('detail.sellingPrice', { price: formatPrice(recipe.sellingPrice) })
                      : undefined
                }
                icon={Edit}
                tone={
                  recipe.grossMarginPct != null && recipe.grossMarginPct < 50
                    ? 'warning'
                    : 'success'
                }
                size="sm"
              />
            </>
          )}
        </div>

        {recipe.instructions && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">{t('detail.instructions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-[var(--text-muted)]">
                {recipe.instructions}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('detail.ingredients')}</CardTitle>
            <CardDescription>
              {canViewCosts && totalRecipeCost != null
                ? t('detail.ingredientsDescCost', { cost: formatPrice(totalRecipeCost) })
                : t('detail.ingredientsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--brand-ultra)] text-left">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                      {t('table.ingredient')}
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                      {t('table.qty')}
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                      {t('table.unit')}
                    </th>
                    {canViewCosts && (
                      <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                        {t('table.unitCost')}
                      </th>
                    )}
                    {canViewCosts && (
                      <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                        {t('table.lineTotal')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {ingredients.map((ing, idx) => {
                    const row = ing as {
                      displayName?: string
                      quantity?: number
                      recipeUnit?: string
                      unitCost?: string | number | null
                      totalCost?: string | number | null
                      warnings?: string[]
                      missingPrice?: boolean
                    }
                    const missing =
                      row.unitCost == null ||
                      row.missingPrice ||
                      (row.warnings && row.warnings.length > 0)
                    return (
                      <tr key={idx} className={cn(missing && 'bg-[var(--red-pale)]/20')}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-[var(--text)]">{row.displayName}</p>
                          {row.warnings?.map((w, i) => (
                            <p key={i} className="text-xs text-[var(--amber)]">
                              {w}
                            </p>
                          ))}
                        </td>
                        <td className="px-4 py-4 tabular-nums">{row.quantity}</td>
                        <td className="px-4 py-4 text-[var(--text-muted)]">{row.recipeUnit}</td>
                        {canViewCosts && (
                          <td className="px-4 py-4">
                            {row.unitCost != null
                              ? formatPrice(Number(row.unitCost))
                              : t('detail.missingPrice')}
                          </td>
                        )}
                        {canViewCosts && (
                          <td className="px-4 py-4 font-medium">
                            {row.totalCost != null ? formatPrice(Number(row.totalCost)) : '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link to="/app/recipes">{t('detail.allRecipes')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/recipe-costing">{t('detail.costingDashboard')}</Link>
          </Button>
        </div>
      </PageShell>
    </RequirePermission>
  )
}
