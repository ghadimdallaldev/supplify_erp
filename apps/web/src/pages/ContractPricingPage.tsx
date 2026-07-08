import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectTrigger } from '../components/ui/select'
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
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { RequirePermission } from '../components/RequirePermission'
import { usePermissions } from '../hooks/usePermissions'
import { formatPrice } from '../utils/format'
import { toast } from 'sonner'
import { Loader2, Plus, Pencil, Ban, Search } from 'lucide-react'
import {
  ResponsiveDataList,
  responsiveDataListClasses,
} from '../components/ui/responsive-data-list'
import { cn } from '../lib/utils'
import { ensureNamespace } from '../i18n'

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

type ContractPricingRow = Record<string, unknown>

export function ContractPricingPage() {
  const { t } = useTranslation('contracts')
  const { can } = usePermissions()
  const canManage = can('CATALOG_MANAGE') || can('CATALOG_EDIT')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [restaurantFilter, setRestaurantFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    void ensureNamespace('contracts')
  }, [])

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
      toast.error(t('pricing.toast.requiredFields'))
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
        toast.success(t('pricing.toast.updated'))
      } else {
        await createPricing(payload).unwrap()
        toast.success(t('pricing.toast.saved'))
      }
      setDialogOpen(false)
      refetch()
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? String((err as { data?: { error?: { message?: string } } }).data?.error?.message)
          : t('pricing.toast.saveFailed')
      toast.error(message || t('pricing.toast.saveFailed'))
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      await deactivatePricing(id).unwrap()
      toast.success(t('pricing.toast.deactivated'))
      refetch()
    } catch {
      toast.error(t('pricing.toast.deactivateFailed'))
    }
  }

  return (
    <RequirePermission permission="CATALOG_VIEW">
      <PageShell maxWidth="wide" data-testid="contract-pricing-page">
        <PageHeader
          title={t('pricing.title')}
          description={t('pricing.description')}
          actions={
            canManage ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t('pricing.addContractPrice')}
              </Button>
            ) : undefined
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('pricing.filters')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <div className="w-full lg:min-w-[200px] lg:flex-1">
              <Label htmlFor="search">{t('pricing.search')}</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="search"
                  className="pl-8"
                  placeholder={t('pricing.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="w-full sm:max-w-none lg:min-w-[180px]">
              <Label htmlFor="restaurant">{t('pricing.restaurant')}</Label>
              <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
                <SelectTrigger id="restaurant" className="mt-1">
                  <option value="">{t('pricing.allRestaurants')}</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div className="w-full sm:max-w-none lg:min-w-[140px]">
              <Label htmlFor="status">{t('pricing.status')}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status" className="mt-1">
                  <option value="all">{t('pricing.statusAll')}</option>
                  <option value="active">{t('pricing.statusActive')}</option>
                  <option value="inactive">{t('pricing.statusInactive')}</option>
                  <option value="expired">{t('pricing.statusExpired')}</option>
                </SelectTrigger>
              </Select>
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
              <p className="text-center py-12 text-[var(--text-muted)]">{t('pricing.empty')}</p>
            ) : (
              <ResponsiveDataList<ContractPricingRow>
                items={pricing as ContractPricingRow[]}
                keyExtractor={(row) => String(row.id)}
                tableAriaLabel={t('pricing.title')}
                tableMinWidth={720}
                renderCard={(row) => {
                  const active = row.is_active !== false
                  return (
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{String(row.product_name)}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {String(row.product_sku ?? '')}
                          </p>
                          <p className="mt-1 text-sm">{String(row.restaurant_name)}</p>
                        </div>
                        <Badge variant={active ? 'default' : 'secondary'}>
                          {active ? t('pricing.statusActive') : t('pricing.statusInactive')}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-[var(--text-muted)]">{t('pricing.catalog')}</p>
                          <p>
                            {row.catalog_price != null
                              ? formatPrice(Number(row.catalog_price))
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-muted)]">
                            {t('pricing.contract')}
                          </p>
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
                            {t('pricing.edit')}
                          </Button>
                          {active && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => handleDeactivate(String(row.id))}
                            >
                              <Ban className="mr-1 h-3 w-3" />
                              {t('pricing.deactivate')}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }}
                tableHeader={
                  <thead>
                    <tr className="border-b border-[var(--app-border)] text-left text-[var(--text-muted)]">
                      <th className="px-4 py-3 font-medium">{t('pricing.restaurant')}</th>
                      <th className="px-4 py-3 font-medium">{t('pricing.product')}</th>
                      <th
                        className={cn(
                          'px-4 py-3 font-medium',
                          responsiveDataListClasses.columnSecondary
                        )}
                      >
                        {t('pricing.catalog')}
                      </th>
                      <th className="px-4 py-3 font-medium">{t('pricing.contract')}</th>
                      <th
                        className={cn(
                          'px-4 py-3 font-medium',
                          responsiveDataListClasses.columnTertiary
                        )}
                      >
                        {t('pricing.valid')}
                      </th>
                      <th
                        className={cn(
                          'px-4 py-3 font-medium',
                          responsiveDataListClasses.columnSecondary
                        )}
                      >
                        {t('pricing.status')}
                      </th>
                      <th className="px-4 py-3 font-medium">{t('pricing.actions')}</th>
                    </tr>
                  </thead>
                }
                renderTableRow={(row) => {
                  const active = row.is_active !== false
                  return (
                    <tr className="border-b border-[var(--app-border)]">
                      <td className="px-4 py-3">{String(row.restaurant_name)}</td>
                      <td className="px-4 py-3">
                        <div>{String(row.product_name)}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {String(row.product_sku ?? '')}
                        </div>
                      </td>
                      <td className={cn('px-4 py-3', responsiveDataListClasses.columnSecondary)}>
                        {row.catalog_price != null ? formatPrice(Number(row.catalog_price)) : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatPrice(Number(row.price))}
                        {row.contract_discount_percentage != null && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {t('pricing.discountOff', {
                              percent: row.contract_discount_percentage,
                            })}
                          </Badge>
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-xs text-[var(--text-muted)]',
                          responsiveDataListClasses.columnTertiary
                        )}
                      >
                        {row.contract_start_date
                          ? String(row.contract_start_date).slice(0, 10)
                          : '—'}{' '}
                        → {row.contract_end_date ? String(row.contract_end_date).slice(0, 10) : '—'}
                      </td>
                      <td className={cn('px-4 py-3', responsiveDataListClasses.columnSecondary)}>
                        <Badge variant={active ? 'default' : 'secondary'}>
                          {active ? t('pricing.statusActive') : t('pricing.statusInactive')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {canManage && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(row)}
                              title={t('pricing.edit')}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            {active && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeactivate(String(row.id))}
                                title={t('pricing.deactivate')}
                              >
                                <Ban className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                }}
              />
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-[var(--text-muted)]">{t('pricing.futureNote')}</p>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>
                {editingId ? t('pricing.dialog.editTitle') : t('pricing.dialog.addTitle')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>{t('pricing.restaurant')}</Label>
                <Select
                  value={form.restaurantId}
                  onValueChange={(value) => setForm({ ...form, restaurantId: value })}
                >
                  <SelectTrigger className="mt-1" disabled={!!editingId}>
                    <option value="">{t('pricing.dialog.selectRestaurant')}</option>
                    {restaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
              <div>
                <Label>{t('pricing.product')}</Label>
                <Select
                  value={form.productId}
                  onValueChange={(value) => setForm({ ...form, productId: value })}
                >
                  <SelectTrigger className="mt-1" disabled={!!editingId}>
                    <option value="">{t('pricing.dialog.selectProduct')}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
              <div>
                <Label>{t('pricing.dialog.contractPrice')}</Label>
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
                  <Label>{t('pricing.dialog.discountOptional')}</Label>
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
                  <Label>{t('pricing.dialog.minOrderQty')}</Label>
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
                  <Label>{t('pricing.dialog.startDate')}</Label>
                  <Input
                    type="date"
                    value={form.contractStartDate}
                    onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('pricing.dialog.endDate')}</Label>
                  <Input
                    type="date"
                    value={form.contractEndDate}
                    onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>{t('pricing.dialog.agreementType')}</Label>
                <Select
                  value={form.agreementType}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      agreementType: value as FormState['agreementType'],
                    })
                  }
                >
                  <SelectTrigger className="mt-1">
                    {AGREEMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
              <div>
                <Label>{t('pricing.dialog.notes')}</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('pricing.dialog.cancel')}
              </Button>
              {canManage && (
                <Button onClick={handleSave} disabled={creating || updating}>
                  {(creating || updating) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('pricing.dialog.save')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </RequirePermission>
  )
}
