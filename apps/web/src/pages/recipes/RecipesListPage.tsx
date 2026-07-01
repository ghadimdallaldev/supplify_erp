import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, RefreshCw, Download, Search, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { RecipeStatusBadge } from '../../components/recipes/RecipeStatusBadge'
import {
  RecipeSummaryCards,
  type RecipeSummaryFilter,
} from '../../components/recipes/RecipeSummaryCards'
import { RecipeAttentionBanner } from '../../components/recipes/RecipeAttentionBanner'
import { FoodCostBar } from '../../components/recipes/FoodCostBar'
import { countByStatus } from '../../components/recipes/recipeShared'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useGetRecipesQuery,
  useGetRecipeCostingDashboardQuery,
  useRecalculateRecipeMutation,
} from '../../services/api/endpoints/recipes'
import { formatPrice } from '../../utils/format'
import { getApiBase } from '../../lib/env'
import { EmptyState } from '../../components/ui/empty-state'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { ensureNamespace } from '../../i18n'
import type { Recipe } from '../../types/recipes'

function activeFilterFromParams(params: URLSearchParams): RecipeSummaryFilter {
  if (params.get('missingCost') === 'true') return 'missingCost'
  if (params.get('aboveTarget') === 'true') return 'aboveTarget'
  if (params.get('recentlyImpacted') === 'true') return 'recentlyImpacted'
  return 'ALL'
}

export function RecipesListPage() {
  const { t } = useTranslation('recipes')
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const itemsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void ensureNamespace('recipes')
  }, [])

  const { can } = usePermissions()
  const canViewCosts = can('RECIPES_VIEW_COSTS')
  const canEdit = can('RECIPES_EDIT') || can('RECIPES_MANAGE')

  const filters = useMemo(
    () => ({
      search: searchParams.get('search') || undefined,
      category: searchParams.get('category') || undefined,
      active: searchParams.get('active') || 'true',
      missingCost: searchParams.get('missingCost') || undefined,
      aboveTarget: searchParams.get('aboveTarget') || undefined,
      recentlyImpacted: searchParams.get('recentlyImpacted') || undefined,
    }),
    [searchParams]
  )

  const hasActiveFilters = useMemo(
    () =>
      Boolean(filters.search) ||
      filters.missingCost === 'true' ||
      filters.aboveTarget === 'true' ||
      filters.recentlyImpacted === 'true' ||
      Boolean(filters.category),
    [filters]
  )

  const { data, isLoading, isError, refetch } = useGetRecipesQuery(filters)
  const { data: dashboardData } = useGetRecipeCostingDashboardQuery(undefined, {
    skip: !canViewCosts || hasActiveFilters,
  })
  const [recalculate, { isLoading: recalculating }] = useRecalculateRecipeMutation()
  const [search, setSearch] = useState(filters.search || '')

  const recipes = data?.recipes ?? []
  const activeFilter = activeFilterFromParams(searchParams)

  const summary = useMemo(() => {
    const dash = dashboardData?.dashboard?.stats
    if (dash && canViewCosts && !hasActiveFilters) {
      const total = dash.activeRecipes
      const missing = dash.missingCostData
      const above = dash.aboveTargetFoodCost
      return {
        total,
        healthy: Math.max(0, total - missing - above),
        aboveTarget: above,
        missingData: missing,
      }
    }
    const total = recipes.length
    return {
      total,
      healthy: countByStatus(recipes, 'HEALTHY'),
      aboveTarget: countByStatus(recipes, 'WARNING'),
      missingData: countByStatus(recipes, 'MISSING_DATA'),
    }
  }, [dashboardData, canViewCosts, hasActiveFilters, recipes])

  const uniqueCategories = useMemo(
    () =>
      Array.from(
        new Set(recipes.map((r) => r.category).filter((c): c is string => Boolean(c)))
      ).sort(),
    [recipes]
  )

  const isDesktop = useMediaQuery('(min-width: 768px)', true)

  const applySearch = () => {
    const next = new URLSearchParams(searchParams)
    if (search) next.set('search', search)
    else next.delete('search')
    setSearchParams(next)
  }

  const setFilter = (key: RecipeSummaryFilter) => {
    const next = new URLSearchParams(searchParams)

    const toggleParam = (param: string) => {
      if (next.get(param) === 'true') next.delete(param)
      else {
        next.delete('missingCost')
        next.delete('aboveTarget')
        next.delete('recentlyImpacted')
        next.set(param, 'true')
      }
    }

    if (key === 'ALL' || key === 'HEALTHY') {
      next.delete('missingCost')
      next.delete('aboveTarget')
      next.delete('recentlyImpacted')
    } else if (key === 'missingCost' || key === 'MISSING_DATA') {
      toggleParam('missingCost')
    } else if (key === 'aboveTarget' || key === 'WARNING') {
      toggleParam('aboveTarget')
    } else if (key === 'recentlyImpacted') {
      toggleParam('recentlyImpacted')
    }

    setSearchParams(next)
    itemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const clearFilters = () => {
    setSearch('')
    setSearchParams({ active: 'true' })
  }

  const scrollToItems = () => {
    itemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <RequirePermission permission="RECIPES_VIEW" title={t('permission.list')}>
      <PageShell maxWidth="wide" data-testid="recipes-list-page">
        <PageHeader
          title={t('list.title')}
          description={t('list.description')}
          actions={
            <>
              {canViewCosts && (
                <Button variant="outline" asChild>
                  <Link to="/app/recipe-costing">{t('list.costingDashboard')}</Link>
                </Button>
              )}
              {canViewCosts && (
                <Button variant="outline" asChild>
                  <a href={`${getApiBase()}/api/recipes/export.csv`} download>
                    <Download className="h-4 w-4 mr-2" />
                    {t('list.exportCsv')}
                  </a>
                </Button>
              )}
              {canEdit && (
                <Button onClick={() => navigate('/app/recipes/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('list.createRecipe')}
                </Button>
              )}
            </>
          }
        />

        {!isLoading && (
          <RecipeSummaryCards
            total={summary.total}
            healthy={summary.healthy}
            aboveTarget={summary.aboveTarget}
            missingData={summary.missingData}
            activeFilter={activeFilter}
            onFilter={setFilter}
          />
        )}

        {canViewCosts && !isLoading && (
          <RecipeAttentionBanner
            missingCount={summary.missingData}
            aboveTargetCount={summary.aboveTarget}
            onViewMissing={() => setFilter('missingCost')}
            onViewAboveTarget={() => setFilter('aboveTarget')}
            onPriceImpact={() => navigate('/app/recipe-costing/price-impact')}
          />
        )}

        <Card className="sticky top-2 z-10 bg-[var(--surface)] shadow-sm">
          <CardContent className="space-y-3 p-4 pt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] lg:items-end">
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                <label
                  htmlFor="recipe-search"
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                >
                  {t('filters.search')}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    id="recipe-search"
                    placeholder={t('filters.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                    className="h-10 pl-10 pr-9"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                      aria-label={t('filters.clearSearch')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              {uniqueCategories.length > 0 ? (
                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('filters.category')}
                  </span>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={filters.category || 'ALL'}
                    onChange={(e) => {
                      const next = new URLSearchParams(searchParams)
                      if (e.target.value === 'ALL') next.delete('category')
                      else next.set('category', e.target.value)
                      setSearchParams(next)
                    }}
                  >
                    <option value="ALL">{t('filters.allCategories')}</option>
                    {uniqueCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
                <Button variant="secondary" onClick={applySearch} className="flex-1 sm:flex-none">
                  {t('filters.searchButton')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  disabled={!hasActiveFilters}
                >
                  {t('filters.clearFilters')}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--app-border)] pt-3 text-sm">
              <span className="text-[var(--text-muted)]">
                {t('filters.showing')}{' '}
                <span className="font-semibold text-[var(--text)]">{recipes.length}</span>{' '}
                {data?.total != null
                  ? t('filters.ofTotal', { total: data.total })
                  : t('filters.recipes')}
              </span>
              {searchParams.get('missingCost') === 'true' ? (
                <Badge variant="secondary" className="gap-1">
                  {t('filters.missingCost')}
                  <button
                    type="button"
                    onClick={() => setFilter('ALL')}
                    aria-label={t('filters.removeFilter')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : null}
              {searchParams.get('aboveTarget') === 'true' ? (
                <Badge variant="secondary" className="gap-1">
                  {t('filters.aboveTarget')}
                  <button
                    type="button"
                    onClick={() => setFilter('ALL')}
                    aria-label={t('filters.removeFilter')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : null}
              {searchParams.get('recentlyImpacted') === 'true' ? (
                <Badge variant="secondary" className="gap-1">
                  {t('filters.recentlyImpacted')}
                  <button
                    type="button"
                    onClick={() => setFilter('ALL')}
                    aria-label={t('filters.removeFilter')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            title={t('empty.loadErrorTitle')}
            description={t('empty.loadErrorDesc')}
            action={<Button onClick={() => refetch()}>{tCommon('actions.retry')}</Button>}
          />
        )}

        {!isLoading && !isError && recipes.length === 0 && (
          <EmptyState
            title={t('empty.noRecipesTitle')}
            description={t('empty.noRecipesDesc')}
            action={
              canEdit ? (
                <Button onClick={() => navigate('/app/recipes/new')}>
                  {t('list.createRecipe')}
                </Button>
              ) : hasActiveFilters ? (
                <Button variant="outline" onClick={clearFilters}>
                  {t('filters.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        )}

        {!isLoading && recipes.length > 0 && (
          <div ref={itemsRef} id="recipes-items-section">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">{t('list.recipeList')}</h2>
              <Button type="button" variant="ghost" size="sm" onClick={scrollToItems}>
                {t('list.itemsCount', { count: recipes.length })}
              </Button>
            </div>

            {/* Single layout — avoid rendering mobile + desktop rows twice */}
            {isDesktop ? (
              <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--brand-ultra)] text-left">
                    <tr>
                      <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                        {t('table.recipe')}
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                        {t('table.category')}
                      </th>
                      {canViewCosts && (
                        <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                          {t('table.sellingPrice')}
                        </th>
                      )}
                      {canViewCosts && (
                        <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                          {t('table.costPerPortion')}
                        </th>
                      )}
                      {canViewCosts && (
                        <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                          {t('table.foodCostPct')}
                        </th>
                      )}
                      {canViewCosts && (
                        <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                          {t('table.marginPct')}
                        </th>
                      )}
                      <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                        {t('table.status')}
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase text-[var(--text-muted)]">
                        {t('table.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border)]">
                    {recipes.map((recipe) => (
                      <tr
                        key={recipe.id}
                        className={cn(
                          'hover:bg-[var(--brand-ultra)]',
                          recipe.calcStatus === 'MISSING_DATA' && 'bg-[var(--red-pale)]/25',
                          recipe.calcStatus === 'WARNING' && 'bg-[var(--amber-pale)]/20'
                        )}
                      >
                        <td className="px-4 py-4">
                          <Link
                            to={`/app/recipes/${recipe.id}`}
                            className="font-medium text-[var(--text)] hover:underline"
                          >
                            {recipe.name}
                          </Link>
                          {recipe.internalCode ? (
                            <p className="text-xs text-[var(--text-muted)]">
                              {recipe.internalCode}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-[var(--text-muted)]">
                          {recipe.category || '—'}
                        </td>
                        {canViewCosts && (
                          <td className="px-4 py-4">
                            {recipe.sellingPrice != null ? formatPrice(recipe.sellingPrice) : '—'}
                          </td>
                        )}
                        {canViewCosts && (
                          <td className="px-4 py-4 font-medium">
                            {recipe.costPerPortion != null
                              ? formatPrice(recipe.costPerPortion)
                              : t('detail.missing')}
                          </td>
                        )}
                        {canViewCosts && (
                          <td className="px-4 py-4">
                            <div className="min-w-[8rem] max-w-xs">
                              <FoodCostBar
                                foodCostPct={recipe.foodCostPct}
                                targetFoodCostPct={recipe.targetFoodCostPct}
                                calcStatus={recipe.calcStatus}
                              />
                            </div>
                          </td>
                        )}
                        {canViewCosts && (
                          <td className="px-4 py-4">
                            {recipe.grossMarginPct != null
                              ? `${recipe.grossMarginPct.toFixed(1)}%`
                              : '—'}
                          </td>
                        )}
                        <td className="px-4 py-4">
                          <RecipeStatusBadge status={recipe.calcStatus} />
                        </td>
                        <td className="px-4 py-4">
                          {canEdit ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={recalculating}
                              onClick={() => recalculate(recipe.id)}
                              title={t('table.recalculateCost')}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-3">
                {recipes.map((recipe) => (
                  <RecipeRowCard
                    key={recipe.id}
                    recipe={recipe}
                    canViewCosts={canViewCosts}
                    canEdit={canEdit}
                    recalculating={recalculating}
                    onRecalculate={() => recalculate(recipe.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </PageShell>
    </RequirePermission>
  )
}

const RecipeRowCard = memo(function RecipeRowCard({
  recipe,
  canViewCosts,
  canEdit,
  recalculating,
  onRecalculate,
}: {
  recipe: Recipe
  canViewCosts: boolean
  canEdit: boolean
  recalculating: boolean
  onRecalculate: () => void
}) {
  const { t } = useTranslation('recipes')

  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4',
        recipe.calcStatus === 'MISSING_DATA' && 'border-[var(--red)]/20',
        recipe.calcStatus === 'WARNING' && 'border-[var(--amber-mid)]/20'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/app/recipes/${recipe.id}`}
            className="truncate font-semibold text-[var(--text)] hover:underline"
          >
            {recipe.name}
          </Link>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {recipe.category || t('list.uncategorized')}
          </p>
        </div>
        <RecipeStatusBadge status={recipe.calcStatus} />
      </div>

      {canViewCosts && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('table.cost')}
            </p>
            <p className="font-semibold">
              {recipe.costPerPortion != null
                ? formatPrice(recipe.costPerPortion)
                : t('detail.missing')}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('table.price')}
            </p>
            <p className="font-semibold">
              {recipe.sellingPrice != null ? formatPrice(recipe.sellingPrice) : '—'}
            </p>
          </div>
        </div>
      )}

      {canViewCosts && recipe.foodCostPct != null && (
        <div className="mt-3">
          <FoodCostBar
            foodCostPct={recipe.foodCostPct}
            targetFoodCostPct={recipe.targetFoodCostPct}
            calcStatus={recipe.calcStatus}
          />
        </div>
      )}

      {canEdit && (
        <div className="mt-3 border-t border-[var(--app-border)] pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={recalculating}
            onClick={onRecalculate}
            className="w-full"
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {t('table.recalculate')}
          </Button>
        </div>
      )}
    </div>
  )
})
