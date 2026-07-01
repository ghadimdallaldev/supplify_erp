import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Copy, Edit, Printer, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { RecipeStatusBadge } from '../../components/recipes/RecipeStatusBadge'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useDuplicateRecipeMutation,
  useGetRecipeCostBreakdownQuery,
  useGetRecipeQuery,
  useRecalculateRecipeMutation,
} from '../../services/api/endpoints/recipes'
import { formatPrice } from '../../utils/format'
import { getApiBase } from '../../lib/env'

export function RecipeDetailPage() {
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

  const recipe = data?.recipe

  if (isLoading) {
    return (
      <PageShell>
        <p className="p-6 text-muted-foreground">Loading recipe…</p>
      </PageShell>
    )
  }

  if (isError || !recipe) {
    return (
      <PageShell>
        <p className="p-6 text-destructive">Recipe not found or failed to load.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </PageShell>
    )
  }

  const breakdown = breakdownData?.breakdown as
    | { ingredients?: Array<Record<string, unknown>>; warnings?: string[] }
    | undefined

  return (
    <RequirePermission permission="RECIPES_VIEW" title="Recipe detail">
      <PageShell maxWidth="wide" data-testid="recipe-detail-page">
        <PageHeader
          title={recipe.name}
          description={recipe.category || 'Recipe costing'}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a
                  href={`${getApiBase()}/api/recipes/${recipe.id}/print`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </a>
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/app/recipes/${recipe.id}/edit`)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    disabled={duplicating}
                    onClick={async () => {
                      const res = await duplicate(recipe.id).unwrap()
                      toast.success('Recipe duplicated')
                      navigate(`/app/recipes/${res.recipe.id}/edit`)
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </Button>
                  <Button
                    disabled={recalculating}
                    onClick={async () => {
                      await recalculate(recipe.id).unwrap()
                      toast.success('Cost recalculated')
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Recalculate
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
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
              >
                {alert.message}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <RecipeStatusBadge status={recipe.calcStatus} />
          </div>
          {canViewCosts && (
            <>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Cost per portion</p>
                <p className="text-lg font-semibold">
                  {recipe.costPerPortion != null ? formatPrice(recipe.costPerPortion) : 'Missing'}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Food cost %</p>
                <p className="text-lg font-semibold">
                  {recipe.foodCostPct != null ? `${recipe.foodCostPct.toFixed(1)}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Target {recipe.targetFoodCostPct != null ? `${recipe.targetFoodCostPct}%` : '—'}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Gross margin %</p>
                <p className="text-lg font-semibold">
                  {recipe.grossMarginPct != null ? `${recipe.grossMarginPct.toFixed(1)}%` : '—'}
                </p>
                {recipe.suggestedSellingPrice != null && (
                  <p className="text-xs text-muted-foreground">
                    Suggested price {formatPrice(recipe.suggestedSellingPrice)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {recipe.instructions && (
          <section className="mb-6">
            <h3 className="font-medium mb-2">Instructions</h3>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {recipe.instructions}
            </p>
          </section>
        )}

        <section>
          <h3 className="font-medium mb-3">Ingredients</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Ingredient</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Unit</th>
                  {canViewCosts && <th className="p-3">Unit cost</th>}
                  {canViewCosts && <th className="p-3">Total</th>}
                </tr>
              </thead>
              <tbody>
                {(breakdown?.ingredients || recipe.ingredients || []).map((ing, idx) => {
                  const row = ing as {
                    displayName?: string
                    quantity?: number
                    recipeUnit?: string
                    unitCost?: string | number | null
                    totalCost?: string | number | null
                    warnings?: string[]
                  }
                  return (
                    <tr key={idx} className="border-t">
                      <td className="p-3">{row.displayName}</td>
                      <td className="p-3">{row.quantity}</td>
                      <td className="p-3">{row.recipeUnit}</td>
                      {canViewCosts && (
                        <td className="p-3">
                          {row.unitCost != null
                            ? formatPrice(Number(row.unitCost))
                            : 'Missing price'}
                        </td>
                      )}
                      {canViewCosts && (
                        <td className="p-3">
                          {row.totalCost != null ? formatPrice(Number(row.totalCost)) : '—'}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-6">
          <Link to="/app/recipes" className="text-sm text-primary hover:underline">
            ← Back to recipes
          </Link>
        </div>
      </PageShell>
    </RequirePermission>
  )
}
