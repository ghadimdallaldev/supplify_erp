import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, TrendingDown, TrendingUp } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { KpiCard } from '../../components/ui/kpi-card'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { RecipeStatusBadge } from '../../components/recipes/RecipeStatusBadge'
import { FoodCostBar } from '../../components/recipes/FoodCostBar'
import { usePermissions } from '../../hooks/usePermissions'
import { useGetRecipePriceImpactsQuery } from '../../services/api/endpoints/recipes'
import { formatPrice } from '../../utils/format'
import { getApiBase } from '../../lib/env'
import { EmptyState } from '../../components/ui/empty-state'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'
import { ensureNamespace } from '../../i18n'
import { TableScroll } from '../../components/ui/table-scroll'
import { responsiveDataListClasses } from '../../components/ui/responsive-data-list'

export function RecipePriceImpactPage() {
  const { t } = useTranslation('recipes')
  const { t: tCommon } = useTranslation('common')
  const { can } = usePermissions()
  const canViewCosts = can('RECIPES_VIEW_COSTS')
  const { data, isLoading, isError, refetch } = useGetRecipePriceImpactsQuery()

  const groups = data?.impacts ?? []
  const totalRecipesAffected = groups.reduce((sum, g) => sum + g.impactedRecipes.length, 0)
  const priceIncreases = groups.filter((g) => (g.event.changePct ?? 0) > 0).length

  useEffect(() => {
    void ensureNamespace('recipes')
  }, [])

  return (
    <RequirePermission permission="RECIPES_VIEW" title={t('permission.priceImpact')}>
      <PageShell maxWidth="wide" data-testid="recipe-price-impact-page">
        <PageHeader
          title={t('priceImpact.title')}
          description={t('priceImpact.description')}
          actions={
            <>
              {canViewCosts && (
                <Button variant="outline" asChild>
                  <a href={`${getApiBase()}/api/recipe-costing/price-impacts/export.csv`} download>
                    <Download className="h-4 w-4 mr-2" />
                    {t('priceImpact.exportCsv')}
                  </a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link to="/app/recipe-costing">{t('priceImpact.dashboard')}</Link>
              </Button>
            </>
          }
        />

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            title={t('priceImpact.loadErrorTitle')}
            description={t('priceImpact.loadErrorDesc')}
            action={
              <Button variant="outline" onClick={() => refetch()}>
                {tCommon('actions.retry')}
              </Button>
            }
          />
        )}

        {!isLoading && !isError && groups.length > 0 && (
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <KpiCard
              label={t('priceImpact.priceEvents')}
              value={groups.length}
              icon={TrendingUp}
              tone="brand"
              size="sm"
            />
            <KpiCard
              label={t('priceImpact.recipesAffected')}
              value={totalRecipesAffected}
              icon={TrendingDown}
              tone="warning"
              size="sm"
            />
            <KpiCard
              label={t('priceImpact.increases')}
              value={priceIncreases}
              description={t('priceImpact.increasesDesc')}
              icon={TrendingUp}
              tone="danger"
              size="sm"
            />
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <EmptyState
            title={t('priceImpact.emptyTitle')}
            description={t('priceImpact.emptyDesc')}
            action={
              <Button asChild>
                <Link to="/app/recipes">{t('priceImpact.viewRecipes')}</Link>
              </Button>
            }
          />
        )}

        <div className="space-y-4">
          {groups.map((group) => {
            const increased = (group.event.changePct ?? 0) > 0
            return (
              <Card key={group.event.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {group.event.productName || t('priceImpact.productPriceChange')}
                      </CardTitle>
                      {canViewCosts && (
                        <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                          <span>
                            {group.event.oldPrice != null ? formatPrice(group.event.oldPrice) : '—'}{' '}
                            → {formatPrice(group.event.newPrice)}
                          </span>
                          {group.event.changePct != null && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                increased
                                  ? 'bg-[var(--red-pale)] text-[var(--red)]'
                                  : 'bg-[var(--mint-pale)] text-[var(--mint)]'
                              )}
                            >
                              {increased ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {group.event.changePct > 0 ? '+' : ''}
                              {group.event.changePct.toFixed(1)}%
                            </span>
                          )}
                          <span>· {group.event.source}</span>
                        </CardDescription>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                      {t(
                        group.impactedRecipes.length === 1
                          ? 'priceImpact.recipeCount'
                          : 'priceImpact.recipeCount_plural',
                        { count: group.impactedRecipes.length }
                      )}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-3 p-4 lg:hidden">
                    {group.impactedRecipes.map((r) => (
                      <article
                        key={r.recipeId}
                        className={cn(
                          'rounded-lg border border-[var(--app-border)] p-3',
                          r.status === 'WARNING' && 'bg-[var(--amber-pale)]/20'
                        )}
                      >
                        <Link
                          to={`/app/recipes/${r.recipeId}`}
                          className="font-medium hover:underline"
                        >
                          {r.recipeName}
                        </Link>
                        {canViewCosts && (
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">
                                {t('table.oldCost')}
                              </p>
                              <p className="tabular-nums">
                                {r.oldCostPerPortion != null
                                  ? formatPrice(r.oldCostPerPortion)
                                  : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">
                                {t('table.newCost')}
                              </p>
                              <p className="font-medium tabular-nums">
                                {r.newCostPerPortion != null
                                  ? formatPrice(r.newCostPerPortion)
                                  : '—'}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="mt-2">
                          <RecipeStatusBadge status={r.status} />
                        </div>
                      </article>
                    ))}
                  </div>
                  <TableScroll
                    aria-label={t('priceImpact.title')}
                    className="hidden lg:block border-0 rounded-none"
                  >
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-[var(--brand-ultra)] text-left">
                        <tr>
                          <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                            {t('table.recipe')}
                          </th>
                          {canViewCosts && (
                            <th
                              className={cn(
                                'px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]',
                                responsiveDataListClasses.columnSecondary
                              )}
                            >
                              {t('table.oldCost')}
                            </th>
                          )}
                          {canViewCosts && (
                            <th
                              className={cn(
                                'px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]',
                                responsiveDataListClasses.columnSecondary
                              )}
                            >
                              {t('table.newCost')}
                            </th>
                          )}
                          {canViewCosts && (
                            <th
                              className={cn(
                                'px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]',
                                responsiveDataListClasses.columnTertiary
                              )}
                            >
                              {t('table.foodCostPct')}
                            </th>
                          )}
                          <th
                            className={cn(
                              'px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]',
                              responsiveDataListClasses.columnSecondary
                            )}
                          >
                            {t('table.status')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--app-border)]">
                        {group.impactedRecipes.map((r) => (
                          <tr
                            key={r.recipeId}
                            className={cn(
                              'hover:bg-[var(--brand-ultra)]',
                              r.status === 'WARNING' && 'bg-[var(--amber-pale)]/20'
                            )}
                          >
                            <td className="px-4 py-3">
                              <Link
                                to={`/app/recipes/${r.recipeId}`}
                                className="font-medium hover:underline"
                              >
                                {r.recipeName}
                              </Link>
                            </td>
                            {canViewCosts && (
                              <td
                                className={cn(
                                  'px-4 py-3 tabular-nums',
                                  responsiveDataListClasses.columnSecondary
                                )}
                              >
                                {r.oldCostPerPortion != null
                                  ? formatPrice(r.oldCostPerPortion)
                                  : '—'}
                              </td>
                            )}
                            {canViewCosts && (
                              <td
                                className={cn(
                                  'px-4 py-3 font-medium tabular-nums',
                                  responsiveDataListClasses.columnSecondary
                                )}
                              >
                                {r.newCostPerPortion != null
                                  ? formatPrice(r.newCostPerPortion)
                                  : '—'}
                              </td>
                            )}
                            {canViewCosts && (
                              <td
                                className={cn(
                                  'px-4 py-3',
                                  responsiveDataListClasses.columnTertiary
                                )}
                              >
                                <div className="min-w-[7rem] max-w-xs">
                                  <FoodCostBar
                                    foodCostPct={r.newFoodCostPct}
                                    targetFoodCostPct={r.targetFoodCostPct}
                                    calcStatus={r.status}
                                    showLabels={false}
                                  />
                                  {r.newFoodCostPct != null && (
                                    <p className="mt-1 text-xs tabular-nums text-[var(--text-muted)]">
                                      {r.newFoodCostPct.toFixed(1)}%
                                    </p>
                                  )}
                                </div>
                              </td>
                            )}
                            <td
                              className={cn('px-4 py-3', responsiveDataListClasses.columnSecondary)}
                            >
                              <RecipeStatusBadge status={r.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </PageShell>
    </RequirePermission>
  )
}
