import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import {
  useGetContractPricingQuery,
  useCreateContractPricingMutation,
  useUpdateContractPricingMutation,
  useDeactivateContractPricingMutation,
  useGetRestaurantsQuery,
  useGetProductsQuery,
} from '../services/api'
import { RequirePermission } from '../components/RequirePermission'
import { usePermissions } from '../hooks/usePermissions'
import { formatPrice } from '../utils/format'
import toast from 'react-hot-toast'
import { Loader2, Plus, Pencil, Ban, Search } from 'lucide-react'

const AGREEMENT_TYPES = ['CUSTOM', 'VOLUME', 'RELATIONSHIP', 'SPECIAL'] as const

type FormState = {
  restaurantId: string
  productId: string
  price: string
  contractDiscountPercentage: string
  contractStartDate: string
  contractEndDate: string
  agreementType: (typeof AGREEMENT_TYPES)[number]
  minOrderQuantity: string
  notes: string
}

const emptyForm: FormState = {
  restaurantId: '',
  productId: '',
  price: '',
  contractDiscountPercentage: '',
  contractStartDate: '',
  contractEndDate: '',
  agreementType: 'CUSTOM',
  minOrderQuantity: '',
  notes: '',
}

export function ContractPricingPage() {
  const { can } = usePermissions()
  const canManage = can('CATALOG_MANAGE') || can('CATALOG_EDIT')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [restaurantFilter, setRestaurantFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const queryParams = useMemo(
    () => ({
      status: statusFilter,
      q: search || undefined,
      restaurantId: restaurantFilter || undefined,
    }),
    [statusFilter, search, restaurantFilter]
  )

  const { data, isLoading, refetch } = useGetContractPricingQuery(queryParams)
  const { data: restaurantsData } = useGetRestaurantsQuery({ limit: 200, offset: 0 })
  const { data: productsData } = useGetProductsQuery({ limit: 500, offset: 0 })
  const [createPricing, { isLoading: creating }] = useCreateContractPricingMutation()
  const [updatePricing, { isLoading: updating }] = useUpdateContractPricingMutation()
  const [deactivatePricing] = useDeactivateContractPricingMutation()

  const pricing = data?.pricing ?? []
  const restaurants = restaurantsData?.restaurants ?? []
  const products = productsData?.products ?? []

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (row: Record<string, unknown>) => {
    setEditingId(String(row.id))
    setForm({
      restaurantId: String(row.restaurant_id),
      productId: String(row.product_id),
      price: String(row.price ?? ''),
      contractDiscountPercentage:
        row.contract_discount_percentage != null ? String(row.contract_discount_percentage) : '',
      contractStartDate: row.contract_start_date
        ? String(row.contract_start_date).slice(0, 10)
        : '',
      contractEndDate: row.contract_end_date ? String(row.contract_end_date).slice(0, 10) : '',
      agreementType: (row.agreement_type as FormState['agreementType']) || 'CUSTOM',
      minOrderQuantity: row.min_order_quantity != null ? String(row.min_order_quantity) : '',
      notes: row.notes ? String(row.notes) : '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const price = parseFloat(form.price)
    if (!form.restaurantId || !form.productId || Number.isNaN(price) || price <= 0) {
      toast.error('Restaurant, product, and a valid price are required')
      return
    }

    const payload = {
      restaurantId: form.restaurantId,
      productId: form.productId,
      price,
      contractDiscountPercentage: form.contractDiscountPercentage
        ? parseFloat(form.contractDiscountPercentage)
        : undefined,
      contractStartDate: form.contractStartDate || undefined,
      contractEndDate: form.contractEndDate || undefined,
      agreementType: form.agreementType,
      minOrderQuantity: form.minOrderQuantity ? parseFloat(form.minOrderQuantity) : undefined,
      notes: form.notes || undefined,
    }

    try {
      if (editingId) {
        await updatePricing({
          id: editingId,
          ...payload,
        }).unwrap()
        toast.success('Contract price updated')
      } else {
        await createPricing(payload).unwrap()
        toast.success('Contract price saved')
      }
      setDialogOpen(false)
      refetch()
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? String((err as { data?: { error?: { message?: string } } }).data?.error?.message)
          : 'Failed to save contract price'
      toast.error(message || 'Failed to save contract price')
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      await deactivatePricing(id).unwrap()
      toast.success('Contract price deactivated')
      refetch()
    } catch {
      toast.error('Failed to deactivate')
    }
  }

  return (
    <RequirePermission permission="CATALOG_VIEW">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[21px] font-black text-[var(--text)]">Contract Pricing</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Set customer-specific prices per restaurant and product.
            </p>
          </div>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add contract price
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <div className="w-full lg:min-w-[200px] lg:flex-1">
              <Label htmlFor="search">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="search"
                  className="pl-8"
                  placeholder="Restaurant, product, SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="w-full sm:max-w-none lg:min-w-[180px]">
              <Label htmlFor="restaurant">Restaurant</Label>
              <select
                id="restaurant"
                className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm"
                value={restaurantFilter}
                onChange={(e) => setRestaurantFilter(e.target.value)}
              >
                <option value="">All restaurants</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:max-w-none lg:min-w-[140px]">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
              </div>
            ) : pricing.length === 0 ? (
              <p className="text-center py-12 text-[var(--text-muted)]">
                No contract prices match your filters.
              </p>
            ) : (
              <>
                <div className="divide-y md:hidden">
                  {pricing.map((row) => {
                    const active = row.is_active !== false
                    return (
                      <div key={String(row.id)} className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{String(row.product_name)}</p>
                            <p className="text-xs text-[var(--text-muted)]">{row.product_sku}</p>
                            <p className="mt-1 text-sm">{String(row.restaurant_name)}</p>
                          </div>
                          <Badge variant={active ? 'default' : 'secondary'}>
                            {active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">Catalog</p>
                            <p>
                              {row.catalog_price != null
                                ? formatPrice(Number(row.catalog_price))
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">Contract</p>
                            <p className="font-semibold">{formatPrice(Number(row.price))}</p>
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                            {active && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => handleDeactivate(String(row.id))}
                              >
                                <Ban className="mr-1 h-3 w-3" />
                                Deactivate
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--app-border)] text-left text-[var(--text-muted)]">
                        <th className="px-4 py-3 font-medium">Restaurant</th>
                        <th className="px-4 py-3 font-medium">Product</th>
                        <th className="px-4 py-3 font-medium">Catalog</th>
                        <th className="px-4 py-3 font-medium">Contract</th>
                        <th className="px-4 py-3 font-medium">Valid</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricing.map((row) => {
                        const active = row.is_active !== false
                        return (
                          <tr key={String(row.id)} className="border-b border-[var(--app-border)]">
                            <td className="px-4 py-3">{String(row.restaurant_name)}</td>
                            <td className="px-4 py-3">
                              <div>{String(row.product_name)}</div>
                              <div className="text-xs text-[var(--text-muted)]">
                                {row.product_sku}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {row.catalog_price != null
                                ? formatPrice(Number(row.catalog_price))
                                : '—'}
                            </td>
                            <td className="px-4 py-3 font-semibold">
                              {formatPrice(Number(row.price))}
                              {row.contract_discount_percentage != null && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {row.contract_discount_percentage}% off
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                              {row.contract_start_date
                                ? String(row.contract_start_date).slice(0, 10)
                                : '—'}{' '}
                              →{' '}
                              {row.contract_end_date
                                ? String(row.contract_end_date).slice(0, 10)
                                : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={active ? 'default' : 'secondary'}>
                                {active ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {canManage && (
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  {active && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDeactivate(String(row.id))}
                                    >
                                      <Ban className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-[var(--text-muted)]">
          Bulk CSV import/export and copy price list between restaurants are planned for a future
          release.
        </p>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit contract price' : 'Add contract price'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Restaurant</Label>
                <select
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  value={form.restaurantId}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, restaurantId: e.target.value })}
                >
                  <option value="">Select restaurant</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Product</Label>
                <select
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  value={form.productId}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}
                >
                  <option value="">Select product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Contract price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Discount % (optional)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.contractDiscountPercentage}
                    onChange={(e) =>
                      setForm({ ...form, contractDiscountPercentage: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Min order qty</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.minOrderQuantity}
                    onChange={(e) => setForm({ ...form, minOrderQuantity: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={form.contractStartDate}
                    onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={form.contractEndDate}
                    onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Agreement type</Label>
                <select
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  value={form.agreementType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      agreementType: e.target.value as FormState['agreementType'],
                    })
                  }
                >
                  {AGREEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              {canManage && (
                <Button onClick={handleSave} disabled={creating || updating}>
                  {(creating || updating) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  )
}
