import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { RecipeStatusBadge } from '../../components/recipes/RecipeStatusBadge'
import { usePermissions } from '../../hooks/usePermissions'
import { useGetRecipePriceImpactsQuery } from '../../services/api/endpoints/recipes'
import { formatPrice } from '../../utils/format'
import { getApiBase } from '../../lib/env'

export function RecipePriceImpactPage() {
  const { can } = usePermissions()
  const canViewCosts = can('RECIPES_VIEW_COSTS')
  const { data, isLoading, isError, refetch } = useGetRecipePriceImpactsQuery()

  const groups = data?.impacts ?? []

  return (
    <RequirePermission permission="RECIPES_VIEW" title="Price impact">
      <PageShell maxWidth="wide" data-testid="recipe-price-impact-page">
        <PageHeader
          title="Supplier price impact"
          description="Recipes affected when supplier or received prices change"
          actions={
            <>
              {canViewCosts && (
                <Button variant="outline" asChild>
                  <a href={`${getApiBase()}/api/recipe-costing/price-impacts/export.csv`} download>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link to="/app/recipe-costing">Dashboard</Link>
              </Button>
            </>
          }
        />

        {isLoading && <p className="text-muted-foreground">Loading price impacts…</p>}
        {isError && (
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        )}

        {!isLoading && groups.length === 0 && (
          <p className="text-muted-foreground">
            No supplier price changes affecting recipes yet. Costs update when you receive orders or
            suppliers change catalog prices.
          </p>
        )}

        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.event.id} className="rounded-lg border p-4">
              <div className="mb-3">
                <h3 className="font-medium">{group.event.productName || 'Product price change'}</h3>
                {canViewCosts && (
                  <p className="text-sm text-muted-foreground">
                    {group.event.oldPrice != null ? formatPrice(group.event.oldPrice) : '—'} →{' '}
                    {formatPrice(group.event.newPrice)}
                    {group.event.changePct != null && (
                      <span>
                        {' '}
                        ({group.event.changePct > 0 ? '+' : ''}
                        {group.event.changePct.toFixed(1)}%)
                      </span>
                    )}
                    <span className="ml-2">· {group.event.source}</span>
                  </p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="p-2">Recipe</th>
                      {canViewCosts && <th className="p-2">Old cost</th>}
                      {canViewCosts && <th className="p-2">New cost</th>}
                      {canViewCosts && <th className="p-2">Food cost %</th>}
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.impactedRecipes.map((r) => (
                      <tr key={r.recipeId} className="border-t">
                        <td className="p-2">
                          <Link to={`/app/recipes/${r.recipeId}`} className="hover:underline">
                            {r.recipeName}
                          </Link>
                        </td>
                        {canViewCosts && (
                          <td className="p-2">
                            {r.oldCostPerPortion != null ? formatPrice(r.oldCostPerPortion) : '—'}
                          </td>
                        )}
                        {canViewCosts && (
                          <td className="p-2">
                            {r.newCostPerPortion != null ? formatPrice(r.newCostPerPortion) : '—'}
                          </td>
                        )}
                        {canViewCosts && (
                          <td className="p-2">
                            {r.newFoodCostPct != null ? `${r.newFoodCostPct.toFixed(1)}%` : '—'}
                          </td>
                        )}
                        <td className="p-2">
                          <RecipeStatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </PageShell>
    </RequirePermission>
  )
}
