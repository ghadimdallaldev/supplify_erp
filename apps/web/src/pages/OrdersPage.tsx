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
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { filterControlClass } from '../components/ui/filter-control'
import { DataTableShell } from '../components/ui/data-table-shell'
import { TableScroll } from '../components/ui/table-scroll'
import { CardActionGrid, cardActionBtnClass } from '../components/ui/card-layout'
import { RequirePermission } from '../components/RequirePermission'
import { EmptyState } from '../components/ui/empty-state'
import { StatusBadge } from '../components/ui/status-badge'
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
import {
  ShoppingCart,
  Search,
  Package,
  Truck,
  FileText,
  CheckCircle,
  Clock,
  Filter,
  Plus,
  AlertCircle,
  Scale,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'

/** @deprecated use filterControlClass from components/ui/filter-control */
const ordersFilterControlClass = filterControlClass
import { Link } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { toast } from 'sonner'
import { formatPrice } from '../utils/format'
import { DeclineOrderDialog } from '../components/orders/DeclineOrderDialog'
import { resolveOrderStatusLabel } from '../components/orders/detail/orderDetailShared'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import { getActiveDisputeForOrder } from '../lib/disputeHelpers'
import { isDisputeReplacementOrder } from '../lib/orderPlacement'

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
      includeItems: true,
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACKNOWLEDGED':
        return <CheckCircle className="h-4 w-4" />
      case 'PROCESSING':
        return <Package className="h-4 w-4" />
      case 'SHIPPED':
        return <Truck className="h-4 w-4" />
      case 'DELIVERED':
        return <Truck className="h-4 w-4" />
      case 'RECEIVED_PARTIAL':
      case 'RECEIVED_FULL':
      case 'RECEIVED_WITH_DISPUTE':
        return <CheckCircle className="h-4 w-4" />
      case 'INVOICED':
        return <FileText className="h-4 w-4" />
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

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
      <EmptyState
        title={t('page.loadFailedTitle')}
        description={errorMessage}
        icon={<AlertCircle className="h-10 w-10" aria-hidden />}
        action={
          <Button onClick={() => refetch()} variant="outline">
            {t('page.tryAgain')}
          </Button>
        }
      />
    )
  }

  return (
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
                <div className="space-y-4 lg:hidden" data-testid="orders-card-list">
                  {filteredOrders?.map((order: any) => (
                    <Card
                      key={order.id}
                      className="hover:shadow-md transition-shadow"
                      data-testid={`order-row-${order.id}`}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                              <CardTitle className="text-lg">
                                {t('page.orderNumber', {
                                  id: order.id.slice(-8).toUpperCase(),
                                })}
                              </CardTitle>
                              <span className="inline-flex items-center gap-1">
                                <span className="text-[var(--text-muted)]" aria-hidden>
                                  {getStatusIcon(order.status)}
                                </span>
                                <StatusBadge
                                  status={order.status}
                                  label={resolveOrderStatusLabel(
                                    t,
                                    order,
                                    isSupplier ? 'SUPPLIER' : 'RESTAURANT'
                                  )}
                                />
                                {isDisputeReplacementOrder(order) && (
                                  <Badge variant="secondary">{t('page.replacement')}</Badge>
                                )}
                                {disputesEnabled &&
                                  getActiveDisputeForOrder(allDisputes, order.id) && (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-400 text-amber-800 bg-amber-50"
                                    >
                                      <Scale className="h-3 w-3 mr-1" aria-hidden />
                                      {t('page.disputeOpen')}
                                    </Badge>
                                  )}
                                {!isSupplier &&
                                  order.status === 'CANCELLED' &&
                                  order.cancelled_by === 'SUPPLIER' &&
                                  order.cancel_reason && (
                                    <p className="text-xs text-red-700 mt-1 max-w-md">
                                      {order.cancel_reason}
                                    </p>
                                  )}
                              </span>
                              {order.status === 'PLACED' && isSupplier && (
                                <Badge variant="destructive">{t('page.actionRequired')}</Badge>
                              )}
                            </div>
                            <div className="text-sm text-[var(--text-muted)] space-y-1">
                              <div>{t('page.restaurant', { name: order.restaurant_name })}</div>
                              <div>
                                {t('page.placed', {
                                  date: new Date(
                                    order.placed_at || order.created_at
                                  ).toLocaleString(),
                                })}
                              </div>
                              {!isSupplier && order.status === 'DELIVERED' && (
                                <div className="mt-2 p-2 rounded bg-[var(--brand-ultra)] text-[var(--brand-mid)] border border-[var(--app-border)] text-xs">
                                  {t('page.deliveredReceiveHintBefore')}{' '}
                                  <Link
                                    to={`/app/receiving?order=${order.id}`}
                                    className="underline"
                                  >
                                    {t('page.deliveredReceiveLink')}
                                  </Link>{' '}
                                  {t('page.deliveredReceiveHintAfter')}
                                </div>
                              )}
                              {isSupplier && order.status === 'DELIVERED' && (
                                <div className="mt-2 p-2 rounded bg-[var(--amber-pale)] text-[var(--amber)] border border-[var(--amber-mid)]/35 text-xs">
                                  {t('page.awaitingReceivingHint')}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-left sm:text-right shrink-0">
                            <div className="text-xl sm:text-2xl font-bold text-[var(--brand-mid)]">
                              {`$${formatPrice(order.total_amount)}`}
                            </div>
                            <div className="text-sm text-[var(--text-muted)]">
                              {t('page.itemsCount', { count: order.items?.length || 0 })}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-4">
                          {/* Order Items Preview */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-[var(--text-muted)] mb-2">
                              {t('page.itemsLabel')}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {order.items?.slice(0, 3).map((item: any, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {item.product_name} × {item.quantity}
                                </Badge>
                              ))}
                              {order.items && order.items.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  {t('page.moreItems', { count: order.items.length - 3 })}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <CardActionGrid>
                            {isSupplier && canEditOrders && order.status === 'PLACED' && (
                              <>
                                <Button
                                  size="sm"
                                  className={cardActionBtnClass()}
                                  onClick={() => handleStatusUpdate(order.id, 'ACKNOWLEDGED')}
                                  data-testid={`order-${order.id}-acknowledge`}
                                >
                                  {t('page.acknowledge')}
                                </Button>
                                {canDeclineOrder && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={cardActionBtnClass()}
                                    onClick={() => {
                                      setDeclineOrderId(order.id)
                                      setDeclineOrderLabel(order.restaurant_name)
                                    }}
                                    data-testid={`order-${order.id}-decline`}
                                  >
                                    {t('page.decline')}
                                  </Button>
                                )}
                              </>
                            )}
                            {isSupplier && canEditOrders && order.status === 'ACKNOWLEDGED' && (
                              <Button
                                size="sm"
                                className={cardActionBtnClass()}
                                onClick={() => handleStatusUpdate(order.id, 'PROCESSING')}
                                data-testid={`order-${order.id}-start-processing`}
                              >
                                {t('page.startProcessing')}
                              </Button>
                            )}
                            {isSupplier && canEditOrders && order.status === 'PROCESSING' && (
                              <Button
                                size="sm"
                                className={cardActionBtnClass()}
                                onClick={() => handleStatusUpdate(order.id, 'SHIPPED')}
                                data-testid={`order-${order.id}-ship`}
                              >
                                {t('page.markShipped')}
                              </Button>
                            )}
                            {isSupplier &&
                              canEditOrders &&
                              order.status === 'SHIPPED' &&
                              updatingOrderId !== order.id && (
                                <Button
                                  size="sm"
                                  className={cardActionBtnClass()}
                                  onClick={() => handleStatusUpdate(order.id, 'DELIVERED')}
                                  disabled={false}
                                  data-testid={`order-${order.id}-deliver`}
                                >
                                  {t('page.markDelivered')}
                                </Button>
                              )}
                            {isSupplier &&
                              (updatingOrderId === order.id || order.status === 'DELIVERED') && (
                                <Button
                                  size="sm"
                                  variant={order.status === 'DELIVERED' ? 'outline' : 'default'}
                                  disabled
                                  className={`${cardActionBtnClass()} cursor-not-allowed opacity-75`}
                                >
                                  {updatingOrderId === order.id ? (
                                    <>{t('page.updating')}</>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      {t('page.delivered')}
                                    </>
                                  )}
                                </Button>
                              )}
                            {!isSupplier && order.status === 'PLACED' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className={cardActionBtnClass()}
                                onClick={() => handleSendReminder(order.id)}
                              >
                                <AlertCircle className="h-4 w-4 mr-1" />
                                {order.reminder_count > 0
                                  ? t('page.remindCount', { count: order.reminder_count })
                                  : t('page.sendReminder')}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className={cardActionBtnClass()}
                              asChild
                            >
                              <Link to={`/app/orders/${order.id}`}>
                                <FileText className="h-4 w-4 mr-1" />
                                {t('page.viewDetails')}
                              </Link>
                            </Button>
                            {isSupplier && (
                              <Button
                                variant="outline"
                                size="sm"
                                className={cardActionBtnClass()}
                                asChild
                              >
                                <Link to={`/app/orders/${order.id}?tab=packing`}>
                                  <Package className="h-4 w-4 mr-1" />
                                  {t('page.packingSlip')}
                                </Link>
                              </Button>
                            )}
                          </CardActionGrid>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {filteredOrders && filteredOrders.length > 0 && (
                  <TableScroll
                    aria-label={ordersTitle}
                    className="hidden lg:block"
                    data-testid="orders-table-view"
                  >
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead className="bg-[var(--brand-ultra)]/80">
                        <tr>
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-[var(--text-muted)]">
                            Order
                          </th>
                          <th className="hidden px-4 py-3 text-start text-xs font-semibold uppercase text-[var(--text-muted)] lg:table-cell">
                            Restaurant
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-[var(--text-muted)]">
                            Status
                          </th>
                          <th className="hidden px-4 py-3 text-start text-xs font-semibold uppercase text-[var(--text-muted)] xl:table-cell">
                            Placed
                          </th>
                          <th className="hidden px-4 py-3 text-end text-xs font-semibold uppercase text-[var(--text-muted)] lg:table-cell">
                            {t('page.itemsLabel')}
                          </th>
                          <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-[var(--text-muted)]">
                            {t('page.total', { defaultValue: 'Total' })}
                          </th>
                          <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-[var(--text-muted)]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((order: any) => (
                          <tr
                            key={order.id}
                            className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                            data-testid={`order-table-row-${order.id}`}
                          >
                            <td className="px-4 py-3 align-middle">
                              <Link
                                to={`/app/orders/${order.id}`}
                                className="font-medium text-[var(--brand-mid)] hover:underline"
                              >
                                {t('page.orderNumber', {
                                  id: order.id.slice(-8).toUpperCase(),
                                })}
                              </Link>
                            </td>
                            <td className="hidden max-w-[10rem] truncate px-4 py-3 align-middle lg:table-cell">
                              {order.restaurant_name}
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <StatusBadge
                                status={order.status}
                                label={resolveOrderStatusLabel(
                                  t,
                                  order,
                                  isSupplier ? 'SUPPLIER' : 'RESTAURANT'
                                )}
                              />
                            </td>
                            <td className="hidden px-4 py-3 align-middle text-[var(--text-muted)] xl:table-cell">
                              {new Date(order.placed_at || order.created_at).toLocaleDateString()}
                            </td>
                            <td className="hidden px-4 py-3 text-end align-middle tabular-nums lg:table-cell">
                              {order.items?.length || 0}
                            </td>
                            <td className="px-4 py-3 text-end align-middle font-semibold tabular-nums text-[var(--brand-mid)]">
                              ${formatPrice(order.total_amount)}
                            </td>
                            <td className="px-4 py-3 text-end align-middle">
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {isSupplier && canEditOrders && order.status === 'PLACED' && (
                                  <>
                                    <Button
                                      size="sm"
                                      className="px-2.5 xl:px-3"
                                      onClick={() => handleStatusUpdate(order.id, 'ACKNOWLEDGED')}
                                      aria-label={t('page.acknowledge')}
                                      title={t('page.acknowledge')}
                                    >
                                      <CheckCircle className="h-4 w-4 xl:mr-1" />
                                      <span className="hidden xl:inline">
                                        {t('page.acknowledge')}
                                      </span>
                                    </Button>
                                    {canDeclineOrder && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="px-2.5 xl:px-3"
                                        onClick={() => {
                                          setDeclineOrderId(order.id)
                                          setDeclineOrderLabel(order.restaurant_name)
                                        }}
                                        aria-label={t('page.decline')}
                                        title={t('page.decline')}
                                      >
                                        <X className="h-4 w-4 xl:mr-1" />
                                        <span className="hidden xl:inline">
                                          {t('page.decline')}
                                        </span>
                                      </Button>
                                    )}
                                  </>
                                )}
                                {isSupplier && canEditOrders && order.status === 'ACKNOWLEDGED' && (
                                  <Button
                                    size="sm"
                                    className="px-2.5 xl:px-3"
                                    onClick={() => handleStatusUpdate(order.id, 'PROCESSING')}
                                    aria-label={t('page.startProcessing')}
                                    title={t('page.startProcessing')}
                                  >
                                    <Package className="h-4 w-4 xl:mr-1" />
                                    <span className="hidden xl:inline">
                                      {t('page.startProcessing')}
                                    </span>
                                  </Button>
                                )}
                                {isSupplier && canEditOrders && order.status === 'PROCESSING' && (
                                  <Button
                                    size="sm"
                                    className="px-2.5 xl:px-3"
                                    onClick={() => handleStatusUpdate(order.id, 'SHIPPED')}
                                    aria-label={t('page.markShipped')}
                                    title={t('page.markShipped')}
                                  >
                                    <Truck className="h-4 w-4 xl:mr-1" />
                                    <span className="hidden xl:inline">
                                      {t('page.markShipped')}
                                    </span>
                                  </Button>
                                )}
                                {isSupplier &&
                                  canEditOrders &&
                                  order.status === 'SHIPPED' &&
                                  updatingOrderId !== order.id && (
                                    <Button
                                      size="sm"
                                      className="px-2.5 xl:px-3"
                                      onClick={() => handleStatusUpdate(order.id, 'DELIVERED')}
                                      aria-label={t('page.markDelivered')}
                                      title={t('page.markDelivered')}
                                    >
                                      <Truck className="h-4 w-4 xl:mr-1" />
                                      <span className="hidden xl:inline">
                                        {t('page.markDelivered')}
                                      </span>
                                    </Button>
                                  )}
                                {!isSupplier && order.status === 'PLACED' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="px-2.5 xl:px-3"
                                    onClick={() => handleSendReminder(order.id)}
                                    aria-label={t('page.sendReminder')}
                                    title={t('page.sendReminder')}
                                  >
                                    <AlertCircle className="h-4 w-4 xl:mr-1" />
                                    <span className="hidden xl:inline">
                                      {t('page.sendReminder')}
                                    </span>
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="px-2.5 xl:px-3"
                                  asChild
                                >
                                  <Link
                                    to={`/app/orders/${order.id}`}
                                    aria-label={t('page.viewDetails')}
                                    title={t('page.viewDetails')}
                                  >
                                    <FileText className="h-4 w-4 xl:mr-1" />
                                    <span className="hidden xl:inline">
                                      {t('page.viewDetails')}
                                    </span>
                                  </Link>
                                </Button>
                                {isSupplier && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="px-2.5 xl:px-3"
                                    asChild
                                  >
                                    <Link
                                      to={`/app/orders/${order.id}?tab=packing`}
                                      aria-label={t('page.packingSlip')}
                                      title={t('page.packingSlip')}
                                    >
                                      <Package className="h-4 w-4 xl:mr-1" />
                                      <span className="hidden xl:inline">
                                        {t('page.packingSlip')}
                                      </span>
                                    </Link>
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                )}

                {(!filteredOrders || filteredOrders.length === 0) && (
                  <EmptyState
                    title={
                      debouncedSearch || status || hasAdvancedFilters || activeTab !== 'all'
                        ? t('page.emptyFilteredTitle')
                        : t('page.emptyTitle')
                    }
                    description={
                      debouncedSearch || status || hasAdvancedFilters || activeTab !== 'all'
                        ? t('page.emptyFilteredDescription')
                        : !isSupplier
                          ? t('page.emptyRestaurantDescription')
                          : t('page.emptySupplierDescription')
                    }
                    icon={<ShoppingCart className="h-10 w-10" aria-hidden />}
                    action={
                      !isSupplier &&
                      canCreateOrders &&
                      !debouncedSearch &&
                      !status &&
                      !hasAdvancedFilters &&
                      activeTab === 'all' ? (
                        <Button asChild>
                          <Link to="/app/cart">
                            <Plus className="h-4 w-4 mr-2" />
                            {t('page.createFirstOrder')}
                          </Link>
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </TabsContent>
            </Tabs>

            {(total != null ? total > 0 : filteredOrders.length > 0) && (
              <div
                className="mt-4 flex flex-col gap-3 border-t border-[var(--app-border)] pt-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid="orders-pagination"
              >
                <p className="text-sm text-[var(--text-muted)]">
                  {t('page.paginationShowing', { start: rangeStart, end: rangeEnd })}
                  {total != null ? t('page.paginationOf', { total }) : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasPrevPage || isFetching}
                    onClick={() => setOffset((prev) => Math.max(0, prev - pageSize))}
                    data-testid="orders-prev-page"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {t('page.previous')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasNextPage || isFetching}
                    onClick={() => setOffset((prev) => prev + pageSize)}
                    data-testid="orders-next-page"
                  >
                    {t('page.next')}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
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
                        <div key={item.productId} className="flex items-center justify-between p-3">
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
  )
}
