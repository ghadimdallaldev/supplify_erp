import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import {
  useCreateRecipeMutation,
  useGetRecipeQuery,
  useUpdateRecipeMutation,
} from '../../services/api/endpoints/recipes'
import { useGetProductsQuery } from '../../services/api'
import type { RecipeIngredient } from '../../types/recipes'

const emptyIngredient = (): RecipeIngredient => ({
  ingredientType: 'SUPPLIER_PRODUCT',
  displayName: '',
  quantity: 1,
  recipeUnit: 'unit',
  costSource: 'AUTO',
  wastePct: 0,
  yieldPct: 100,
})

export function RecipeBuilderPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { data: existing, isLoading: loadingExisting } = useGetRecipeQuery(id!, { skip: !isEdit })
  const [createRecipe, { isLoading: creating }] = useCreateRecipeMutation()
  const [updateRecipe, { isLoading: updating }] = useUpdateRecipeMutation()
  const { data: productsData } = useGetProductsQuery({ limit: 100 })

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [targetFoodCostPct, setTargetFoodCostPct] = useState('30')
  const [portionCount, setPortionCount] = useState('1')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([emptyIngredient()])

  useEffect(() => {
    if (existing?.recipe) {
      const r = existing.recipe
      setName(r.name)
      setCategory(r.category || '')
      setSellingPrice(r.sellingPrice != null ? String(r.sellingPrice) : '')
      setTargetFoodCostPct(r.targetFoodCostPct != null ? String(r.targetFoodCostPct) : '30')
      setPortionCount(String(r.portionCount))
      setInstructions(r.instructions || '')
      setNotes(r.notes || '')
      setIngredients(r.ingredients?.length ? r.ingredients : [emptyIngredient()])
    }
  }, [existing])

  const updateIngredient = (index: number, patch: Partial<RecipeIngredient>) => {
    setIngredients((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const onProductPick = (index: number, productId: string) => {
    const product = productsData?.products?.find((p) => p.id === productId)
    if (!product) return
    updateIngredient(index, {
      productId,
      supplierId: product.supplier_id,
      displayName: product.name,
      recipeUnit: product.unit || 'unit',
      purchaseUnit: product.unit || 'unit',
    })
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Recipe name is required')
      return
    }
    const body = {
      name: name.trim(),
      category: category || null,
      sellingPrice: sellingPrice ? Number(sellingPrice) : null,
      targetFoodCostPct: targetFoodCostPct ? Number(targetFoodCostPct) : null,
      portionCount: Number(portionCount) || 1,
      instructions: instructions || null,
      notes: notes || null,
      ingredients: ingredients.filter((ing) => ing.displayName.trim()),
    }
    try {
      if (isEdit && id) {
        const res = await updateRecipe({ id, body }).unwrap()
        toast.success('Recipe updated')
        navigate(`/app/recipes/${res.recipe.id}`)
      } else {
        const res = await createRecipe(body).unwrap()
        toast.success('Recipe created')
        navigate(`/app/recipes/${res.recipe.id}`)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save recipe')
    }
  }

  if (isEdit && loadingExisting) {
    return (
      <PageShell>
        <p className="p-6 text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  return (
    <RequirePermission anyOf={['RECIPES_EDIT', 'RECIPES_MANAGE']} title="Recipe builder">
      <PageShell maxWidth="wide">
        <PageHeader
          title={isEdit ? 'Edit recipe' : 'New recipe'}
          description="Link supplier products to calculate purchasing-linked food cost"
        />
        <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sellingPrice">Selling price</Label>
              <Input
                id="sellingPrice"
                type="number"
                min={0}
                step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetFc">Target food cost %</Label>
              <Input
                id="targetFc"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={targetFoodCostPct}
                onChange={(e) => setTargetFoodCostPct(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portions">Portions / yield</Label>
              <Input
                id="portions"
                type="number"
                min={0.001}
                step="any"
                value={portionCount}
                onChange={(e) => setPortionCount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Ingredients</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIngredients((r) => [...r, emptyIngredient()])}
              >
                Add ingredient
              </Button>
            </div>
            {ingredients.map((ing, index) => (
              <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Supplier product</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={ing.productId || ''}
                    onChange={(e) => onProductPick(index, e.target.value)}
                  >
                    <option value="">Manual / select product…</option>
                    {productsData?.products?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.supplier_name || p.supplier_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={ing.displayName}
                    onChange={(e) => updateIngredient(index, { displayName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(index, { quantity: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Recipe unit</Label>
                  <Input
                    value={ing.recipeUnit}
                    onChange={(e) => updateIngredient(index, { recipeUnit: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Purchase unit</Label>
                  <Input
                    value={ing.purchaseUnit || ''}
                    onChange={(e) => updateIngredient(index, { purchaseUnit: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Waste %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    value={ing.wastePct ?? 0}
                    onChange={(e) => updateIngredient(index, { wastePct: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cost source</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={ing.costSource || 'AUTO'}
                    onChange={(e) =>
                      updateIngredient(index, {
                        costSource: e.target.value as RecipeIngredient['costSource'],
                      })
                    }
                  >
                    <option value="AUTO">Auto (last received → catalog)</option>
                    <option value="LAST_RECEIVED">Last received</option>
                    <option value="INVOICE">Invoice</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="CATALOG">Catalog</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={creating || updating}>
              {isEdit ? 'Save changes' : 'Create recipe'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </PageShell>
    </RequirePermission>
  )
}
