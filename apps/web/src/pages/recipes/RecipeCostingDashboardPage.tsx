import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { usePermissions } from '../../hooks/usePermissions'
import { useGetRecipeCostingDashboardQuery } from '../../services/api/endpoints/recipes'
import { formatPrice } from '../../utils/format'
import { RecipeStatusBadge } from '../../components/recipes/RecipeStatusBadge'

export function RecipeCostingDashboardPage() {
  const { can } = usePermissions()
  const canViewCosts = can('RECIPES_VIEW_COSTS')
  const { data, isLoading, isError, refetch } = useGetRecipeCostingDashboardQuery()
  const dashboard = data?.dashboard

  return (
    <RequirePermission permission="RECIPES_VIEW" title="Recipe costing">
      <PageShell maxWidth="wide" data-testid="recipe-costing-dashboard">
        <PageHeader
          title="Recipe Costing"
          description="Supplier-connected menu profitability from your purchasing data"
          actions={
            <Button variant="outline" asChild>
              <Link to="/app/recipe-costing/price-impact">Supplier price impact</Link>
            </Button>
          }
        />

        <div className="mb-4 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          Sales/POS data is not connected yet. This dashboard currently shows purchasing-linked
          recipe cost and margin only.
        </div>

        {isLoading && <p className="text-muted-foreground">Loading dashboard…</p>}
        {isError && (
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        )}

        {dashboard && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
              <StatCard label="Active recipes" value={String(dashboard.stats.activeRecipes)} />
              <StatCard
                label="Above target food cost"
                value={String(dashboard.stats.aboveTargetFoodCost)}
              />
              <StatCard label="Missing cost data" value={String(dashboard.stats.missingCostData)} />
              <StatCard
                label="Recently impacted"
                value={String(dashboard.stats.recentlyImpacted)}
              />
              {canViewCosts && dashboard.stats.averageFoodCostPct != null && (
                <StatCard
                  label="Average food cost %"
                  value={`${dashboard.stats.averageFoodCostPct.toFixed(1)}%`}
                />
              )}
            </div>

            {canViewCosts && dashboard.highestCostRecipes.length > 0 && (
              <section className="mb-6">
                <h3 className="font-medium mb-2">Highest cost recipes</h3>
                <RecipeMiniTable
                  rows={dashboard.highestCostRecipes.map((r) => ({
                    id: r.id,
                    name: r.name,
                    col: formatPrice(r.costPerPortion),
                    status: r.calcStatus,
                  }))}
                />
              </section>
            )}

            {canViewCosts && dashboard.lowestMarginRecipes.length > 0 && (
              <section className="mb-6">
                <h3 className="font-medium mb-2">Lowest margin recipes</h3>
                <RecipeMiniTable
                  rows={dashboard.lowestMarginRecipes.map((r) => ({
                    id: r.id,
                    name: r.name,
                    col: `${r.grossMarginPct.toFixed(1)}% margin`,
                    status: 'WARNING',
                  }))}
                />
              </section>
            )}

            {dashboard.recentPriceChanges.length > 0 && (
              <section>
                <h3 className="font-medium mb-2">Recent supplier price changes</h3>
                <ul className="space-y-2">
                  {dashboard.recentPriceChanges.map((e) => (
                    <li key={e.id} className="rounded-lg border p-3 text-sm">
                      <strong>{e.productName || e.productId}</strong>
                      {canViewCosts && e.changePct != null && (
                        <span className="text-muted-foreground">
                          {' '}
                          — {e.changePct > 0 ? '+' : ''}
                          {e.changePct.toFixed(1)}% ({e.affectedRecipeCount} recipes)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-6">
              <Button asChild>
                <Link to="/app/recipes">View all recipes</Link>
              </Button>
            </div>
          </>
        )}
      </PageShell>
    </RequirePermission>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  )
}

function RecipeMiniTable({
  rows,
}: {
  rows: Array<{ id: string; name: string; col: string; status: string }>
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t first:border-t-0">
              <td className="p-3">
                <Link to={`/app/recipes/${r.id}`} className="hover:underline font-medium">
                  {r.name}
                </Link>
              </td>
              <td className="p-3">{r.col}</td>
              <td className="p-3">
                <RecipeStatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
