import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ChefHat, TrendingDown, TrendingUp } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { KpiCard } from '../../components/ui/kpi-card'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { RecipeAttentionBanner } from '../../components/recipes/RecipeAttentionBanner'
import { RecipeStatusBadge } from '../../components/recipes/RecipeStatusBadge'
import { FoodCostBar } from '../../components/recipes/FoodCostBar'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useGetRecipeAlertsQuery,
  useGetRecipeCostingDashboardQuery,
} from '../../services/api/endpoints/recipes'
import { formatPrice } from '../../utils/format'
import { Skeleton } from '../../components/ui/skeleton'
import { EmptyState } from '../../components/ui/empty-state'
import { ensureNamespace } from '../../i18n'

export function RecipeCostingDashboardPage() {
  const { t } = useTranslation('recipes')
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canViewCosts = can('RECIPES_VIEW_COSTS')
  const { data, isLoading, isError, refetch } = useGetRecipeCostingDashboardQuery()
  const { data: alertsData } = useGetRecipeAlertsQuery()
  const dashboard = data?.dashboard
  const alerts = alertsData?.alerts ?? []

  useEffect(() => {
    void ensureNamespace('recipes')
  }, [])

  const goRecipes = (query: string) => navigate(`/app/recipes?${query}`)

  return (
    <RequirePermission permission="RECIPES_VIEW" title={t('permission.costing')}>
      <PageShell maxWidth="wide" data-testid="recipe-costing-dashboard">
        <PageHeader
          title={t('dashboard.title')}
          description={t('dashboard.description')}
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to="/app/recipe-costing/price-impact">{t('dashboard.priceImpact')}</Link>
              </Button>
              <Button asChild>
                <Link to="/app/recipes">{t('dashboard.allRecipes')}</Link>
              </Button>
            </>
          }
        />

        <div className="mb-4 rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-bg-subtle)] p-3 text-sm text-[var(--text-muted)]">
          {t('dashboard.posNotice')}
        </div>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            title={t('dashboard.loadErrorTitle')}
            description={t('dashboard.loadErrorDesc')}
            action={
              <Button variant="outline" onClick={() => refetch()}>
                {tCommon('actions.retry')}
              </Button>
            }
          />
        )}

        {dashboard && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button type="button" className="text-left" onClick={() => goRecipes('active=true')}>
                <KpiCard
                  label={t('dashboard.activeRecipes')}
                  value={dashboard.stats.activeRecipes}
                  icon={ChefHat}
                  tone="brand"
                  size="sm"
                  className="h-full cursor-pointer transition hover:shadow-md"
                />
              </button>
              <button
                type="button"
                className="text-left"
                onClick={() => goRecipes('aboveTarget=true')}
              >
                <KpiCard
                  label={t('dashboard.aboveTargetFoodCost')}
                  value={dashboard.stats.aboveTargetFoodCost}
                  icon={AlertCircle}
                  tone="warning"
                  size="sm"
                  className="h-full cursor-pointer transition hover:shadow-md"
                />
              </button>
              <button
                type="button"
                className="text-left"
                onClick={() => goRecipes('missingCost=true')}
              >
                <KpiCard
                  label={t('dashboard.missingCostData')}
                  value={dashboard.stats.missingCostData}
                  icon={TrendingDown}
                  tone="danger"
                  size="sm"
                  className="h-full cursor-pointer transition hover:shadow-md"
                />
              </button>
              <button
                type="button"
                className="text-left"
                onClick={() => goRecipes('recentlyImpacted=true')}
              >
                <KpiCard
                  label={t('dashboard.recentlyImpacted')}
                  value={dashboard.stats.recentlyImpacted}
                  icon={TrendingUp}
                  tone="info"
                  size="sm"
                  className="h-full cursor-pointer transition hover:shadow-md"
                />
              </button>
            </div>

            {canViewCosts && dashboard.stats.averageFoodCostPct != null && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t('dashboard.portfolioFoodCost')}</CardTitle>
                  <CardDescription>{t('dashboard.portfolioFoodCostDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="max-w-md">
                  <p className="mb-2 text-3xl font-bold tabular-nums text-[var(--text)]">
                    {dashboard.stats.averageFoodCostPct.toFixed(1)}%
                  </p>
                  <FoodCostBar
                    foodCostPct={dashboard.stats.averageFoodCostPct}
                    targetFoodCostPct={30}
                    calcStatus={dashboard.stats.averageFoodCostPct > 30 ? 'WARNING' : 'HEALTHY'}
                  />
                </CardContent>
              </Card>
            )}

            <RecipeAttentionBanner
              missingCount={dashboard.stats.missingCostData}
              aboveTargetCount={dashboard.stats.aboveTargetFoodCost}
              onViewMissing={() => goRecipes('missingCost=true')}
              onViewAboveTarget={() => goRecipes('aboveTarget=true')}
              onPriceImpact={() => navigate('/app/recipe-costing/price-impact')}
            />

            {alerts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('dashboard.activeAlerts')}</CardTitle>
                  <CardDescription>{t('dashboard.activeAlertsDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {alerts.slice(0, 5).map((alert, idx) => (
                    <div
                      key={String(alert.id ?? idx)}
                      className="rounded-lg border border-[var(--amber-mid)]/30 bg-[var(--amber-pale)]/40 px-3 py-2 text-sm text-[var(--text)]"
                    >
                      {String(alert.message ?? alert.alertType ?? t('dashboard.alertFallback'))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {canViewCosts && dashboard.highestCostRecipes.length > 0 && (
                <RecipeRankCard
                  title={t('dashboard.highestCostTitle')}
                  description={t('dashboard.highestCostDesc')}
                  rows={dashboard.highestCostRecipes.map((r) => ({
                    id: r.id,
                    name: r.name,
                    metric: formatPrice(r.costPerPortion),
                    foodCostPct: r.foodCostPct,
                    calcStatus: r.calcStatus,
                  }))}
                />
              )}

              {canViewCosts && dashboard.lowestMarginRecipes.length > 0 && (
                <RecipeRankCard
                  title={t('dashboard.lowestMarginTitle')}
                  description={t('dashboard.lowestMarginDesc')}
                  rows={dashboard.lowestMarginRecipes.map((r) => ({
                    id: r.id,
                    name: r.name,
                    metric: t('dashboard.marginMetric', { pct: r.grossMarginPct.toFixed(1) }),
                    foodCostPct: r.foodCostPct,
                    calcStatus: 'WARNING' as const,
                    targetFoodCostPct: 30,
                  }))}
                />
              )}
            </div>

            {dashboard.mostImpactedRecipes?.length > 0 && (
              <RecipeRankCard
                title={t('dashboard.mostImpactedTitle')}
                description={t('dashboard.mostImpactedDesc')}
                rows={dashboard.mostImpactedRecipes.map((r) => ({
                  id: r.id,
                  name: r.name,
                  metric:
                    r.costDiffPct != null
                      ? t('dashboard.costChangeMetric', {
                          sign: r.costDiffPct > 0 ? '+' : '',
                          pct: r.costDiffPct.toFixed(1),
                        })
                      : '—',
                  foodCostPct: r.newFoodCostPct,
                  calcStatus: 'WARNING' as const,
                }))}
              />
            )}

            {dashboard.recentPriceChanges.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('dashboard.recentPriceChanges')}</CardTitle>
                  <CardDescription>{t('dashboard.recentPriceChangesDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dashboard.recentPriceChanges.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-col gap-1 rounded-lg border border-[var(--app-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-[var(--text)]">
                          {e.productName || e.productId}
                        </p>
                        {canViewCosts && e.changePct != null && (
                          <p className="text-sm text-[var(--text-muted)]">
                            {e.changePct > 0 ? '+' : ''}
                            {e.changePct.toFixed(1)}% ·{' '}
                            {t(
                              e.affectedRecipeCount === 1
                                ? 'dashboard.recipeCount'
                                : 'dashboard.recipeCount_plural',
                              { count: e.affectedRecipeCount }
                            )}
                          </p>
                        )}
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/app/recipe-costing/price-impact">
                          {t('dashboard.viewImpact')}
                        </Link>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </PageShell>
    </RequirePermission>
  )
}

function RecipeRankCard({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: Array<{
    id: string
    name: string
    metric: string
    foodCostPct?: number | null
    calcStatus: string
    targetFoodCostPct?: number | null
  }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-[var(--app-border)] p-3 transition hover:bg-[var(--brand-ultra)]"
          >
            <div className="flex items-start justify-between gap-3">
              <Link
                to={`/app/recipes/${r.id}`}
                className="font-medium text-[var(--text)] hover:underline"
              >
                {r.name}
              </Link>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text)]">
                {r.metric}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {r.foodCostPct != null ? (
                <div className="min-w-0 flex-1">
                  <FoodCostBar
                    foodCostPct={r.foodCostPct}
                    targetFoodCostPct={r.targetFoodCostPct ?? 30}
                    calcStatus={r.calcStatus as 'HEALTHY' | 'WARNING' | 'MISSING_DATA'}
                    showLabels={false}
                  />
                </div>
              ) : null}
              <RecipeStatusBadge status={r.calcStatus} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
