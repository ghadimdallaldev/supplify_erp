import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useGetOrdersQuery,
  useUpdateOrderMutation,
  useCreateManualOrderMutation,
  useGetRestaurantsQuery,
  useGetProductsQuery,
  useSendOrderReminderMutation,
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ContentReveal, Skeleton } from '../components/ui/skeleton'
import { ErrorState } from '../components/ui/error-state'
import { TablePagination } from '../components/ui/table-pagination'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { filterControlClass } from '../components/ui/filter-control'
import { DataTableShell } from '../components/ui/data-table-shell'
import { RequirePermission } from '../components/RequirePermission'
import { Input } from '../components/ui/input'
import { Select, SelectTrigger } from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Search, Filter, Plus, AlertCircle } from 'lucide-react'

/** @deprecated use filterControlClass from components/ui/filter-control */
const ordersFilterControlClass = filterControlClass
import { Link } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { toast } from 'sonner'
import { formatPrice } from '../utils/format'
import { DeclineOrderDialog } from '../components/orders/DeclineOrderDialog'
import { OrdersResponsiveList } from '../components/orders/OrdersResponsiveList'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'

const ORDERS_PAGE_SIZE = 20

const ORDER_STATUS_FILTER_VALUES = [
  'PLACED',
  'ACKNOWLEDGED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'RECEIVED_PARTIAL',
  'RECEIVED_FULL',
  'INVOICED',
  'COMPLETED',
  'CANCELLED',
] as const

export function OrdersPage() {
  const { t } = useTranslation('orders')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [offset, setOffset] = useState(0)
  const [showManualOrderDialog, setShowManualOrderDialog] = useState(false)
  const [showProductSelection, setShowProductSelection] = useState(false)
  const [selectedRestaurant, setSelectedRestaurant] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [declineOrderId, setDeclineOrderId] = useState<string | null>(null)
  const [declineOrderLabel, setDeclineOrderLabel] = useState<string | undefined>()
  const [manualOrderItems, setManualOrderItems] = useState<
    Array<{
      productId: string
      quantity: number
      notes?: string
      productName?: string
      price?: number
    }>
  >([])
  const { can } = usePermissions()
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { persona } = useWorkspaceRole()
  const ordersTitle = isSupplier
    ? (persona.pageCopy?.orders?.title ?? t('page.supplierTitle'))
    : (persona.pageCopy?.orders?.title ?? t('page.restaurantTitle'))
  const ordersDescription = isSupplier
    ? (persona.pageCopy?.orders?.description ?? t('page.supplierDescription'))
    : (persona.pageCopy?.orders?.description ?? t('page.restaurantDescription'))
  const canManageOrders = can('ORDERS_MANAGE')
  const canEditOrders = can('ORDERS_EDIT') || canManageOrders
  const canCreateOrders = can('ORDERS_CREATE') || canManageOrders
  const canDeclineOrder = canManageOrders

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setOffset(0)
  }, [status, debouncedSearch, dateFrom, dateTo])

  const { data, isLoading, isFetching, error, refetch } = useGetOrdersQuery(
    {
      status: status || undefined,
      q: debouncedSearch || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      limit: ORDERS_PAGE_SIZE,
      offset,
      includeItems: false,
    },
    {
      refetchOnMountOrArgChange: false,
      refetchOnFocus: false,
      refetchOnReconnect: true,
      pollingInterval: 60_000,
      skipPollingIfUnfocused: true,
    }
  )

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )
  const { data: restaurantDisputesData } = useGetDisputesQuery(undefined, {
    skip: isSupplier || !disputesEnabled,
    pollingInterval: 0,
  })
  const { data: supplierDisputesData } = useGetIncomingDisputesQuery(undefined, {
    skip: !isSupplier || !disputesEnabled,
    pollingInterval: 0,
  })
  const allDisputes =
    (isSupplier ? supplierDisputesData?.disputes : restaurantDisputesData?.disputes) ?? []

  const { data: restaurantsData } = useGetRestaurantsQuery(undefined, { skip: !isSupplier })
  const { data: productsData } = useGetProductsQuery(
    { limit: 100 },
    { skip: !isSupplier || !showManualOrderDialog }
  )
  const [updateOrder] = useUpdateOrderMutation()
  const [createManualOrder, { isLoading: isCreatingManualOrder }] = useCreateManualOrderMutation()
  const [sendReminder] = useSendOrderReminderMutation()

  const handleAddProductToOrder = (product: any) => {
    const existingItem = manualOrderItems.find((item) => item.productId === product.id)
    if (existingItem) {
      setManualOrderItems(
        manualOrderItems.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      setManualOrderItems([
        ...manualOrderItems,
        {
          productId: product.id,
          quantity: 1,
          productName: product.name,
          price: product.price,
        },
      ])
    }
  }

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setManualOrderItems(manualOrderItems.filter((item) => item.productId !== productId))
    } else {
      setManualOrderItems(
        manualOrderItems.map((item) =>
          item.productId === productId ? { ...item, quantity } : item
        )
      )
    }
  }

  const handleCreateOrder = async () => {
    if (!selectedRestaurant) {
      toast.error(t('toast.selectRestaurant'))
      return
    }

    if (manualOrderItems.length === 0) {
      toast.error(t('toast.addProductRequired'))
      return
    }

    try {
      await createManualOrder({
        restaurant_id: selectedRestaurant,
        items: manualOrderItems,
        notes: orderNotes,
      }).unwrap()

      toast.success(t('toast.orderCreated'))
      setShowManualOrderDialog(false)
      setShowProductSelection(false)
      setSelectedRestaurant('')
      setOrderNotes('')
      setManualOrderItems([])
      refetch()
    } catch (error: any) {
      const errorMessage = error?.data?.error?.message || t('toast.createFailed')
      const errorName = error?.data?.error?.name

      // For limit exceeded errors, show a more helpful message with upgrade suggestion
      if (errorName === 'LIMIT_EXCEEDED') {
        toast.error(errorMessage, {
          duration: 6000,
          icon: '⚠️',
        })
        // Show additional toast with upgrade link
        setTimeout(() => {
          toast.custom(
            (id) => (
              <div className="flex items-center gap-3">
                <span>{t('page.upgradeHint')}</span>
                <button
                  onClick={() => {
                    toast.dismiss(id)
                    window.location.href = '/app/settings'
                  }}
                  className="px-3 py-1 text-sm font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand)]/90 erp-pressable"
                >
                  {t('page.viewPlans')}
                </button>
              </div>
            ),
            {
              duration: 8000,
            }
          )
        }, 500)
      } else {
        toast.error(errorMessage)
      }
    }
  }

  const filteredProducts = productsData?.products?.filter(
    (product: any) =>
      product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      product.sku?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)

  const handleStatusUpdate = async (
    orderId: string,
    newStatus: string,
    extra?: { decline_reason?: string }
  ) => {
    if (updatingOrderId === orderId) return // Prevent multiple clicks

    try {
      setUpdatingOrderId(orderId) // Set immediately - button will be replaced by disabled button
      await updateOrder({ id: orderId, data: { status: newStatus, ...extra } }).unwrap()
      const successLabel =
        newStatus === 'CANCELLED' && isSupplier
          ? t('toast.orderDeclined')
          : t('toast.statusUpdated', {
              status: t(`status.${newStatus}`, { defaultValue: newStatus }),
            })
      toast.success(successLabel)
      setUpdatingOrderId(null)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('toast.updateFailed'))
      setUpdatingOrderId(null)
    }
  }

  const handleSendReminder = async (orderId: string) => {
    try {
      await sendReminder(orderId).unwrap()
      toast.success(t('toast.reminderSent'))
      refetch() // Refresh orders to update reminder count
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('toast.reminderFailed'))
    }
  }

  const hasAdvancedFilters = Boolean(dateFrom || dateTo)

  // Tab buckets apply only when status dropdown is "All Statuses" (server handles explicit status).
  const filteredOrders = useMemo(() => {
    return (data?.orders ?? []).filter((order: any) => {
      if (status) return true
      if (activeTab === 'all') return true
      if (activeTab === 'new') return order.status === 'PLACED'
      if (activeTab === 'processing') {
        return ['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED'].includes(order.status)
      }
      if (activeTab === 'shipped') return order.status === 'SHIPPED'
      if (activeTab === 'completed') {
        return ['RECEIVED_FULL', 'RECEIVED_WITH_DISPUTE', 'INVOICED', 'COMPLETED'].includes(
          order.status
        )
      }
      return true
    })
  }, [data?.orders, status, activeTab])

  const pagination = data?.pagination
  const total = pagination?.total
  const pageSize = pagination?.limit ?? ORDERS_PAGE_SIZE
  const rangeStart = filteredOrders.length === 0 ? 0 : offset + 1
  const rangeEnd =
    filteredOrders.length === 0
      ? 0
      : total != null
        ? Math.min(offset + pageSize, total)
        : offset + filteredOrders.length
  const hasNextPage = total != null ? offset + pageSize < total : filteredOrders.length === pageSize
  const hasPrevPage = offset > 0

  const hasActiveFilters = Boolean(debouncedSearch || status || hasAdvancedFilters)

  const clearAllFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
    setActiveTab('all')
    setOffset(0)
    setMoreFiltersOpen(false)
  }

  if (isLoading) {
    return (
      <PageShell maxWidth="wide">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg sm:w-48" />
              <Skeleton className="h-10 w-full rounded-lg sm:w-36" />
            </div>
          </CardContent>
        </Card>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </PageShell>
    )
  }

  if (error) {
    const errorMessage = (error as any)?.data?.error?.message || t('page.loadFailedTitle')
    return (
      <PageShell maxWidth="wide">
        <ErrorState
          title={t('page.loadFailedTitle')}
          description={errorMessage}
          icon={<AlertCircle className="h-10 w-10" aria-hidden />}
          action={
            <Button onClick={() => refetch()} variant="outline">
              {t('page.tryAgain')}
            </Button>
          }
        />
      </PageShell>
    )
  }

  return (
    <ContentReveal>
      <RequirePermission permission="ORDERS_VIEW" title="orders">
        <PageShell data-testid="orders-page" maxWidth="wide">
          <PageHeader
            title={ordersTitle}
            description={ordersDescription}
            actions={
              <>
                {isSupplier && canCreateOrders && (
                  <Button onClick={() => setShowManualOrderDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('page.createOrder')}
                  </Button>
                )}
                {!isSupplier && canCreateOrders && (
                  <Button asChild>
                    <Link to="/app/cart" data-testid="orders-create-new-order">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('page.createNewOrder')}
                    </Link>
                  </Button>
                )}
              </>
            }
          />

          <DataTableShell
            data-testid="orders-table-shell"
            stickyHeader
            search={
              <div className="relative min-w-0">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <Input
                  placeholder={
                    isSupplier
                      ? t('page.searchSupplierPlaceholder')
                      : t('page.searchRestaurantPlaceholder')
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${ordersFilterControlClass} pl-11 pr-4`}
                  aria-label={t('page.searchAriaLabel')}
                />
              </div>
            }
            filters={
              <>
                <Select
                  className="w-full sm:w-[12.5rem]"
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value)
                    if (value) setActiveTab('all')
                  }}
                >
                  <SelectTrigger className="shadow-sm" aria-label={t('page.filterStatusAriaLabel')}>
                    <option value="">{t('page.allStatuses')}</option>
                    {ORDER_STATUS_FILTER_VALUES.map((statusValue) => (
                      <option key={statusValue} value={statusValue}>
                        {t(`status.${statusValue}`)}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 gap-2 px-4 whitespace-nowrap"
                  onClick={() => setMoreFiltersOpen(true)}
                  aria-expanded={moreFiltersOpen}
                >
                  <Filter className="h-4 w-4" />
                  {t('page.moreFilters')}
                  {hasAdvancedFilters ? (
                    <Badge variant="secondary" className="ml-0.5 px-2 py-0 text-xs font-medium">
                      {t('page.filtersOn')}
                    </Badge>
                  ) : null}
                </Button>
              </>
            }
          >
            <div className="p-4 sm:p-5">
              {(debouncedSearch || status || hasAdvancedFilters) && (
                <div className="mb-4 border-b border-[var(--app-border)] pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      {t('page.activeFilters')}
                    </span>
                    {debouncedSearch ? (
                      <Badge variant="outline" className="px-2.5 py-1 font-normal">
                        {t('page.filterSearch', { value: debouncedSearch })}
                      </Badge>
                    ) : null}
                    {status ? (
                      <Badge variant="outline" className="px-2.5 py-1 font-normal">
                        {t('page.filterStatus', {
                          value: t(`status.${status}`, { defaultValue: status }),
                        })}
                      </Badge>
                    ) : null}
                    {dateFrom ? (
                      <Badge variant="outline" className="px-2.5 py-1 font-normal">
                        {t('page.filterFrom', { value: dateFrom })}
                      </Badge>
                    ) : null}
                    {dateTo ? (
                      <Badge variant="outline" className="px-2.5 py-1 font-normal">
                        {t('page.filterTo', { value: dateTo })}
                      </Badge>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={clearAllFilters}
                    >
                      {t('page.clearAll')}
                    </Button>
                  </div>
                </div>
              )}

              <Dialog open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
                <DialogContent size="sm">
                  <DialogHeader>
                    <DialogTitle>{t('page.moreFiltersTitle')}</DialogTitle>
                    <DialogDescription>{t('page.moreFiltersDescription')}</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="orders-date-from">{t('page.placedFrom')}</Label>
                      <Input
                        id="orders-date-from"
                        type="date"
                        className="mt-1"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="orders-date-to">{t('page.placedTo')}</Label>
                      <Input
                        id="orders-date-to"
                        type="date"
                        className="mt-1"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={clearAllFilters}>
                      {t('page.clearAll')}
                    </Button>
                    <Button type="button" onClick={() => setMoreFiltersOpen(false)}>
                      {t('page.apply')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Order Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1.5">
                  <TabsTrigger value="all" className="px-3 py-2">
                    {t('page.tabs.all')}
                  </TabsTrigger>
                  <TabsTrigger value="new" className="px-3 py-2">
                    {t('page.tabs.new')}
                  </TabsTrigger>
                  <TabsTrigger value="processing" className="px-3 py-2">
                    {t('page.tabs.processing')}
                  </TabsTrigger>
                  <TabsTrigger value="shipped" className="px-3 py-2">
                    {t('page.tabs.shipped')}
                  </TabsTrigger>
                  <TabsTrigger value="completed" className="px-3 py-2">
                    {t('page.tabs.completed')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="space-y-4">
                  <OrdersResponsiveList
                    orders={filteredOrders}
                    t={t}
                    ordersTitle={ordersTitle}
                    isSupplier={isSupplier}
                    canEditOrders={canEditOrders}
                    canDeclineOrder={canDeclineOrder}
                    canCreateOrders={canCreateOrders}
                    disputesEnabled={disputesEnabled}
                    allDisputes={allDisputes}
                    updatingOrderId={updatingOrderId}
                    hasActiveFilters={hasActiveFilters}
                    activeTab={activeTab}
                    onStatusUpdate={handleStatusUpdate}
                    onSendReminder={handleSendReminder}
                    onDecline={(orderId, label) => {
                      setDeclineOrderId(orderId)
                      setDeclineOrderLabel(label)
                    }}
                  />
                </TabsContent>
              </Tabs>

              {(total != null ? total > 0 : filteredOrders.length > 0) && (
                <TablePagination
                  className="mt-4 pt-4"
                  data-testid="orders-pagination"
                  summary={
                    <>
                      {t('page.paginationShowing', { start: rangeStart, end: rangeEnd })}
                      {total != null ? t('page.paginationOf', { total }) : ''}
                    </>
                  }
                  hasPrevPage={hasPrevPage}
                  hasNextPage={hasNextPage}
                  isFetching={isFetching}
                  onPrev={() => setOffset((prev) => Math.max(0, prev - pageSize))}
                  onNext={() => setOffset((prev) => prev + pageSize)}
                  prevLabel={t('page.previous')}
                  nextLabel={t('page.next')}
                />
              )}
            </div>
          </DataTableShell>

          {/* Manual Order Creation Dialog */}
          {isSupplier && (
            <Dialog open={showManualOrderDialog} onOpenChange={setShowManualOrderDialog}>
              <DialogContent size="lg">
                <DialogHeader>
                  <DialogTitle>{t('page.manualOrderTitle')}</DialogTitle>
                  <DialogDescription>{t('page.manualOrderDescription')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Restaurant Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurant">{t('page.restaurantRequired')}</Label>
                    <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                      <SelectTrigger id="restaurant">
                        <option value="">
                          {(restaurantsData?.restaurants?.length ?? 0) === 0
                            ? t('page.noEligibleRestaurants')
                            : t('page.selectRestaurant')}
                        </option>
                        {restaurantsData?.restaurants?.map((restaurant: any) => (
                          <option key={restaurant.id} value={restaurant.id}>
                            {restaurant.name}
                          </option>
                        ))}
                      </SelectTrigger>
                    </Select>
                    {(restaurantsData?.restaurants?.length ?? 0) === 0 && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('page.eligibleRestaurantsHint')}
                      </p>
                    )}
                  </div>

                  {/* Order Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="orderNotes">{t('page.orderNotes')}</Label>
                    <textarea
                      id="orderNotes"
                      rows={3}
                      className="w-full px-3 py-2 border border-[var(--app-border-mid)] rounded-md"
                      placeholder={t('page.orderNotesPlaceholder')}
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                    />
                  </div>

                  {/* Products in Order */}
                  {manualOrderItems.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t('page.productsInOrder')}</Label>
                      <div className="border rounded-md divide-y">
                        {manualOrderItems.map((item) => (
                          <div
                            key={item.productId}
                            className="flex items-center justify-between p-3"
                          >
                            <div className="flex-1">
                              <p className="font-medium">{item.productName}</p>
                              <p className="text-sm text-[var(--text-muted)]">
                                {t('page.priceEach', { price: formatPrice(item.price) })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleUpdateQuantity(item.productId, item.quantity - 1)
                                }
                              >
                                -
                              </Button>
                              <span className="w-12 text-center">{item.quantity}</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleUpdateQuantity(item.productId, item.quantity + 1)
                                }
                              >
                                +
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add Products Button */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowProductSelection(true)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('page.addProducts')}
                  </Button>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowManualOrderDialog(false)
                      setSelectedRestaurant('')
                      setOrderNotes('')
                      setManualOrderItems([])
                    }}
                  >
                    {t('page.cancel')}
                  </Button>
                  <Button
                    disabled={
                      !selectedRestaurant || manualOrderItems.length === 0 || isCreatingManualOrder
                    }
                    onClick={handleCreateOrder}
                  >
                    {isCreatingManualOrder ? t('page.creating') : t('page.createOrder')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Product Selection Dialog */}
          <Dialog open={showProductSelection} onOpenChange={setShowProductSelection}>
            <DialogContent size="xl">
              <DialogHeader>
                <DialogTitle>{t('page.selectProductsTitle')}</DialogTitle>
                <DialogDescription>{t('page.selectProductsDescription')}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                  <Input
                    placeholder={t('page.searchProductsPlaceholder')}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Product List */}
                <div className="border rounded-md max-h-96 overflow-y-auto divide-y">
                  {filteredProducts?.map((product: any) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-4 hover:bg-[var(--brand-ultra)]"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-[var(--text-muted)]">{product.sku}</p>
                        <p className="text-sm font-semibold text-[var(--mint)]">
                          ${formatPrice(product.price)} / {product.unit}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleAddProductToOrder(product)
                          toast.success(t('toast.productAdded', { name: product.name }))
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {t('page.add')}
                      </Button>
                    </div>
                  ))}

                  {(!filteredProducts || filteredProducts.length === 0) && (
                    <div className="text-center py-8 text-[var(--text-muted)]">
                      {t('page.noProductsFound')}
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowProductSelection(false)}>
                  {t('page.done')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DeclineOrderDialog
            open={Boolean(declineOrderId)}
            onOpenChange={(open) => {
              if (!open) {
                setDeclineOrderId(null)
                setDeclineOrderLabel(undefined)
              }
            }}
            orderLabel={declineOrderLabel}
            isSubmitting={Boolean(declineOrderId && updatingOrderId === declineOrderId)}
            onConfirm={async (reason) => {
              if (!declineOrderId) return
              await handleStatusUpdate(declineOrderId, 'CANCELLED', { decline_reason: reason })
              setDeclineOrderId(null)
              setDeclineOrderLabel(undefined)
            }}
          />
        </PageShell>
      </RequirePermission>
    </ContentReveal>
  )
}
