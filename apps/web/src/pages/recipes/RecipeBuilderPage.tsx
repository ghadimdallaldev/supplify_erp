import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { FoodCostBar } from '../../components/recipes/FoodCostBar'
import {
  useCreateRecipeMutation,
  useGetRecipeQuery,
  useUpdateRecipeMutation,
} from '../../services/api/endpoints/recipes'
import { useGetProductsQuery } from '../../services/api'
import type { RecipeIngredient } from '../../types/recipes'
import { ensureNamespace } from '../../i18n'

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
  const { t } = useTranslation('recipes')
  const { t: tCommon } = useTranslation('common')
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
    void ensureNamespace('recipes')
  }, [])

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
      toast.error(t('toasts.nameRequired'))
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
        toast.success(t('toasts.updated'))
        navigate(`/app/recipes/${res.recipe.id}`)
      } else {
        const res = await createRecipe(body).unwrap()
        toast.success(t('toasts.created'))
        navigate(`/app/recipes/${res.recipe.id}`)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('toasts.saveFailed'))
    }
  }

  if (isEdit && loadingExisting) {
    return (
      <PageShell>
        <p className="p-6 text-muted-foreground">{t('builder.loading')}</p>
      </PageShell>
    )
  }

  return (
    <RequirePermission anyOf={['RECIPES_EDIT', 'RECIPES_MANAGE']} title={t('permission.builder')}>
      <PageShell maxWidth="wide">
        <PageHeader
          title={isEdit ? t('builder.editTitle') : t('builder.newTitle')}
          description={t('builder.description')}
        />
        <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('builder.basicsTitle')}</CardTitle>
              <CardDescription>{t('builder.basicsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t('builder.name')}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t('builder.category')}</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sellingPrice">{t('builder.sellingPrice')}</Label>
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
                <Label htmlFor="targetFc">{t('builder.targetFoodCost')}</Label>
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
                <Label htmlFor="portions">{t('builder.portions')}</Label>
                <Input
                  id="portions"
                  type="number"
                  min={0.001}
                  step="any"
                  value={portionCount}
                  onChange={(e) => setPortionCount(e.target.value)}
                />
              </div>
              {targetFoodCostPct && (
                <div className="sm:col-span-2 max-w-md">
                  <p className="mb-2 text-xs text-[var(--text-muted)]">
                    {t('builder.targetFoodCostPreview')}
                  </p>
                  <FoodCostBar
                    foodCostPct={null}
                    targetFoodCostPct={Number(targetFoodCostPct) || 30}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{t('builder.ingredientsTitle')}</CardTitle>
                <CardDescription>{t('builder.ingredientsDesc')}</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIngredients((r) => [...r, emptyIngredient()])}
              >
                {t('builder.addIngredient')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {ingredients.map((ing, index) => (
                <div
                  key={index}
                  className="relative grid gap-2 rounded-lg border border-[var(--app-border)] p-3 sm:grid-cols-2"
                >
                  {ingredients.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 h-8 w-8 p-0 text-[var(--text-muted)]"
                      onClick={() => setIngredients((rows) => rows.filter((_, i) => i !== index))}
                      aria-label={t('builder.removeIngredient')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="space-y-1 sm:col-span-2">
                    <Label>{t('builder.supplierProduct')}</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={ing.productId || ''}
                      onChange={(e) => onProductPick(index, e.target.value)}
                    >
                      <option value="">{t('builder.selectProduct')}</option>
                      {productsData?.products?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.supplier_name || p.supplier_id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('builder.name')}</Label>
                    <Input
                      value={ing.displayName}
                      onChange={(e) => updateIngredient(index, { displayName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('builder.quantity')}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={ing.quantity}
                      onChange={(e) =>
                        updateIngredient(index, { quantity: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('builder.recipeUnit')}</Label>
                    <Input
                      value={ing.recipeUnit}
                      onChange={(e) => updateIngredient(index, { recipeUnit: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('builder.purchaseUnit')}</Label>
                    <Input
                      value={ing.purchaseUnit || ''}
                      onChange={(e) => updateIngredient(index, { purchaseUnit: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('builder.wastePct')}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      value={ing.wastePct ?? 0}
                      onChange={(e) =>
                        updateIngredient(index, { wastePct: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('builder.costSource')}</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={ing.costSource || 'AUTO'}
                      onChange={(e) =>
                        updateIngredient(index, {
                          costSource: e.target.value as RecipeIngredient['costSource'],
                        })
                      }
                    >
                      <option value="AUTO">{t('builder.costSourceOptions.AUTO')}</option>
                      <option value="LAST_RECEIVED">
                        {t('builder.costSourceOptions.LAST_RECEIVED')}
                      </option>
                      <option value="INVOICE">{t('builder.costSourceOptions.INVOICE')}</option>
                      <option value="CONTRACT">{t('builder.costSourceOptions.CONTRACT')}</option>
                      <option value="CATALOG">{t('builder.costSourceOptions.CATALOG')}</option>
                      <option value="MANUAL">{t('builder.costSourceOptions.MANUAL')}</option>
                    </select>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('builder.instructionsNotes')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instructions">{t('builder.instructions')}</Label>
                <Textarea
                  id="instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t('builder.notes')}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" disabled={creating || updating}>
              {isEdit ? t('builder.saveChanges') : t('builder.createRecipe')}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              {tCommon('actions.cancel')}
            </Button>
          </div>
        </form>
      </PageShell>
    </RequirePermission>
  )
}
