import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, Download } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { RecipeStatusBadge } from '../../components/recipes/RecipeStatusBadge'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useGetRecipesQuery,
  useRecalculateRecipeMutation,
} from '../../services/api/endpoints/recipes'
import { formatPrice } from '../../utils/format'
import { getApiBase } from '../../lib/env'
import { EmptyState } from '../../components/ui/empty-state'

export function RecipesListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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

  const { data, isLoading, isError, refetch } = useGetRecipesQuery(filters)
  const [recalculate, { isLoading: recalculating }] = useRecalculateRecipeMutation()
  const [search, setSearch] = useState(filters.search || '')

  const recipes = data?.recipes ?? []

  const applySearch = () => {
    const next = new URLSearchParams(searchParams)
    if (search) next.set('search', search)
    else next.delete('search')
    setSearchParams(next)
  }

  const toggleFilter = (key: string) => {
    const next = new URLSearchParams(searchParams)
    if (next.get(key) === 'true') next.delete(key)
    else next.set(key, 'true')
    setSearchParams(next)
  }

  return (
    <RequirePermission permission="RECIPES_VIEW" title="Recipes">
      <PageShell maxWidth="wide" data-testid="recipes-list-page">
        <PageHeader
          title="Recipes"
          description="Purchasing-linked menu recipes and food cost tracking"
          actions={
            <>
              {canViewCosts && (
                <Button variant="outline" asChild>
                  <a href={`${getApiBase()}/api/recipes/export.csv`} download>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </a>
                </Button>
              )}
              {canEdit && (
                <Button onClick={() => navigate('/app/recipes/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create recipe
                </Button>
              )}
            </>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            className="max-w-sm"
          />
          <Button variant="secondary" onClick={applySearch}>
            Search
          </Button>
          <Button
            variant={searchParams.get('missingCost') === 'true' ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleFilter('missingCost')}
          >
            Missing cost
          </Button>
          <Button
            variant={searchParams.get('aboveTarget') === 'true' ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleFilter('aboveTarget')}
          >
            Above target FC
          </Button>
          <Button
            variant={searchParams.get('recentlyImpacted') === 'true' ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleFilter('recentlyImpacted')}
          >
            Recently impacted
          </Button>
        </div>

        {isLoading && <p className="text-muted-foreground p-4">Loading recipes…</p>}
        {isError && (
          <EmptyState
            title="Could not load recipes"
            description="Check your connection and try again."
            action={<Button onClick={() => refetch()}>Retry</Button>}
          />
        )}

        {!isLoading && !isError && recipes.length === 0 && (
          <EmptyState
            title="No recipes yet"
            description="Build your first recipe from supplier catalog ingredients to see food cost and margin."
            action={
              canEdit ? (
                <Button onClick={() => navigate('/app/recipes/new')}>Create recipe</Button>
              ) : undefined
            }
          />
        )}

        {!isLoading && recipes.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3 font-medium">Recipe</th>
                  <th className="p-3 font-medium">Category</th>
                  {canViewCosts && <th className="p-3 font-medium">Selling price</th>}
                  {canViewCosts && <th className="p-3 font-medium">Cost / portion</th>}
                  {canViewCosts && <th className="p-3 font-medium">Food cost %</th>}
                  {canViewCosts && <th className="p-3 font-medium">Margin %</th>}
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => (
                  <tr key={recipe.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3">
                      <Link
                        to={`/app/recipes/${recipe.id}`}
                        className="font-medium hover:underline"
                      >
                        {recipe.name}
                      </Link>
                    </td>
                    <td className="p-3 text-muted-foreground">{recipe.category || '—'}</td>
                    {canViewCosts && (
                      <td className="p-3">
                        {recipe.sellingPrice != null ? formatPrice(recipe.sellingPrice) : '—'}
                      </td>
                    )}
                    {canViewCosts && (
                      <td className="p-3">
                        {recipe.costPerPortion != null
                          ? formatPrice(recipe.costPerPortion)
                          : 'Missing'}
                      </td>
                    )}
                    {canViewCosts && (
                      <td className="p-3">
                        {recipe.foodCostPct != null ? `${recipe.foodCostPct.toFixed(1)}%` : '—'}
                      </td>
                    )}
                    {canViewCosts && (
                      <td className="p-3">
                        {recipe.grossMarginPct != null
                          ? `${recipe.grossMarginPct.toFixed(1)}%`
                          : '—'}
                      </td>
                    )}
                    <td className="p-3">
                      <RecipeStatusBadge status={recipe.calcStatus} />
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={recalculating}
                            onClick={() => recalculate(recipe.id)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageShell>
    </RequirePermission>
  )
}
