import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'

/** Shared height/padding so filter controls align and text does not touch borders. */
const ordersFilterControlClass =
  'h-10 min-h-10 w-full rounded-lg border border-[var(--app-border-mid)] bg-[var(--surface)] text-sm text-[var(--text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30 focus-visible:border-[var(--brand-mid)]'
import { Link } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import toast from 'react-hot-toast'
import { formatPrice } from '../utils/format'
import { DeclineOrderDialog } from '../components/orders/DeclineOrderDialog'
import { getOrderStatusLabel } from '../lib/orderStatusDisplay'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import { getActiveDisputeForOrder } from '../lib/disputeHelpers'
import { isDisputeReplacementOrder } from '../lib/orderPlacement'

export function OrdersPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
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
    ? 'Orders Inbox'
    : (persona.pageCopy?.orders?.title ?? 'Orders Inbox')
  const ordersDescription = isSupplier
    ? 'Manage inbound orders from restaurants'
    : (persona.pageCopy?.orders?.description ?? 'Track your orders and their status')
  const canManageOrders = can('ORDERS_MANAGE')
  const canEditOrders = can('ORDERS_EDIT') || canManageOrders
  const canCreateOrders = can('ORDERS_CREATE') || canManageOrders
  const canDeclineOrder = canManageOrders

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const { data, isLoading, error, refetch } = useGetOrdersQuery(
    {
      status: status || undefined,
      q: debouncedSearch || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      limit: 100,
      offset: 0,
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
      toast.error('Please select a restaurant')
      return
    }

    if (manualOrderItems.length === 0) {
      toast.error('Please add at least one product to the order')
      return
    }

    try {
      await createManualOrder({
        restaurant_id: selectedRestaurant,
        items: manualOrderItems,
        notes: orderNotes,
      }).unwrap()

      toast.success('Order created successfully!')
      setShowManualOrderDialog(false)
      setShowProductSelection(false)
      setSelectedRestaurant('')
      setOrderNotes('')
      setManualOrderItems([])
      refetch()
    } catch (error: any) {
      const errorMessage = error?.data?.error?.message || 'Failed to create order'
      const errorName = error?.data?.error?.name

      // For limit exceeded errors, show a more helpful message with upgrade suggestion
      if (errorName === 'LIMIT_EXCEEDED') {
        toast.error(errorMessage, {
          duration: 6000,
          icon: '⚠️',
        })
        // Show additional toast with upgrade link
        setTimeout(() => {
          toast(
            (t) => (
              <div className="flex items-center gap-3">
                <span>💡 Want more orders? Upgrade your subscription!</span>
                <button
                  onClick={() => {
                    toast.dismiss(t.id)
                    window.location.href = '/app/settings'
                  }}
                  className="px-3 py-1 text-sm font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand)]/90"
                >
                  View Plans
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
          ? 'Order declined'
          : `Order status updated to ${newStatus}`
      toast.success(successLabel)
      setUpdatingOrderId(null)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update order status')
      setUpdatingOrderId(null)
    }
  }

  const handleSendReminder = async (orderId: string) => {
    try {
      await sendReminder(orderId).unwrap()
      toast.success('Reminder sent to supplier successfully')
      refetch() // Refresh orders to update reminder count
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to send reminder')
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

  const clearAllFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
    setActiveTab('all')
    setMoreFiltersOpen(false)
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-start">
          <div>
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
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
      </div>
    )
  }

  if (error) {
    const errorMessage = (error as any)?.data?.error?.message || 'Failed to load orders'
    return (
      <EmptyState
        title="Failed to load orders"
        description={errorMessage}
        icon={<AlertCircle className="h-10 w-10" aria-hidden />}
        action={
          <Button onClick={() => refetch()} variant="outline">
            Try again
          </Button>
        }
      />
    )
  }

  return (
    <RequirePermission permission="ORDERS_VIEW" title="orders">
      <div className="space-y-6" data-testid="orders-page">
        <PageHeader
          title={ordersTitle}
          description={ordersDescription}
          actions={
            <>
              {isSupplier && canCreateOrders && (
                <Button onClick={() => setShowManualOrderDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Order
                </Button>
              )}
              {!isSupplier && canCreateOrders && (
                <Button asChild>
                  <Link to="/app/cart" data-testid="orders-create-new-order">
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Order
                  </Link>
                </Button>
              )}
            </>
          }
        />

        {/* Filters and Search */}
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <Input
                  placeholder={
                    isSupplier
                      ? 'Search by order ID or restaurant…'
                      : 'Search by order ID, restaurant, or supplier…'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${ordersFilterControlClass} pl-11 pr-4`}
                  aria-label="Search orders"
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 shrink-0">
                <Select
                  className="w-full sm:w-[12.5rem]"
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value)
                    if (value) setActiveTab('all')
                  }}
                >
                  <SelectTrigger className="shadow-sm" aria-label="Filter by order status">
                    <option value="">All Statuses</option>
                    <option value="PLACED">Placed</option>
                    <option value="ACKNOWLEDGED">Acknowledged</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="SHIPPED">Shipped</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="RECEIVED_PARTIAL">Received (Partial)</option>
                    <option value="RECEIVED_FULL">Received (Full)</option>
                    <option value="INVOICED">Invoiced</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
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
                  More Filters
                  {hasAdvancedFilters ? (
                    <Badge variant="secondary" className="ml-0.5 px-2 py-0 text-xs font-medium">
                      On
                    </Badge>
                  ) : null}
                </Button>
              </div>
            </div>
            {(debouncedSearch || status || hasAdvancedFilters) && (
              <div className="mt-4 border-t border-[var(--app-border)] pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    Active filters
                  </span>
                  {debouncedSearch ? (
                    <Badge variant="outline" className="px-2.5 py-1 font-normal">
                      Search: {debouncedSearch}
                    </Badge>
                  ) : null}
                  {status ? (
                    <Badge variant="outline" className="px-2.5 py-1 font-normal">
                      Status: {status}
                    </Badge>
                  ) : null}
                  {dateFrom ? (
                    <Badge variant="outline" className="px-2.5 py-1 font-normal">
                      From: {dateFrom}
                    </Badge>
                  ) : null}
                  {dateTo ? (
                    <Badge variant="outline" className="px-2.5 py-1 font-normal">
                      To: {dateTo}
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={clearAllFilters}
                  >
                    Clear all
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>More filters</DialogTitle>
              <DialogDescription>
                Narrow orders by placed date. Search and status filters apply from the toolbar.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="orders-date-from">Placed from</Label>
                <Input
                  id="orders-date-from"
                  type="date"
                  className="mt-1"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="orders-date-to">Placed to</Label>
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
                Clear all
              </Button>
              <Button type="button" onClick={() => setMoreFiltersOpen(false)}>
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Order Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1.5">
            <TabsTrigger value="all" className="px-3 py-2">
              All Orders
            </TabsTrigger>
            <TabsTrigger value="new" className="px-3 py-2">
              New (Needs Action)
            </TabsTrigger>
            <TabsTrigger value="processing" className="px-3 py-2">
              Processing
            </TabsTrigger>
            <TabsTrigger value="shipped" className="px-3 py-2">
              Shipped
            </TabsTrigger>
            <TabsTrigger value="completed" className="px-3 py-2">
              Completed
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            <div className="space-y-4">
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
                            Order #{order.id.slice(-8).toUpperCase()}
                          </CardTitle>
                          <span className="inline-flex items-center gap-1">
                            <span className="text-[var(--text-muted)]" aria-hidden>
                              {getStatusIcon(order.status)}
                            </span>
                            <StatusBadge
                              status={order.status}
                              label={getOrderStatusLabel(
                                order,
                                isSupplier ? 'SUPPLIER' : 'RESTAURANT'
                              )}
                            />
                            {isDisputeReplacementOrder(order) && (
                              <Badge variant="secondary">Replacement</Badge>
                            )}
                            {disputesEnabled && getActiveDisputeForOrder(allDisputes, order.id) && (
                              <Badge
                                variant="outline"
                                className="border-amber-400 text-amber-800 bg-amber-50"
                              >
                                <Scale className="h-3 w-3 mr-1" aria-hidden />
                                Dispute open
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
                            <Badge variant="destructive">Action Required</Badge>
                          )}
                        </div>
                        <div className="text-sm text-[var(--text-muted)] space-y-1">
                          <div>Restaurant: {order.restaurant_name}</div>
                          <div>
                            Placed: {new Date(order.placed_at || order.created_at).toLocaleString()}
                          </div>
                          {!isSupplier && order.status === 'DELIVERED' && (
                            <div className="mt-2 p-2 rounded bg-[var(--brand-ultra)] text-[var(--brand-mid)] border border-[var(--app-border)] text-xs">
                              Supplier marked this order as delivered. Please{' '}
                              <Link to={`/app/receiving?order=${order.id}`} className="underline">
                                receive this order
                              </Link>{' '}
                              to update inventory and generate an invoice.
                            </div>
                          )}
                          {isSupplier && order.status === 'DELIVERED' && (
                            <div className="mt-2 p-2 rounded bg-[var(--amber-pale)] text-[var(--amber)] border border-[var(--amber-mid)]/35 text-xs">
                              Awaiting restaurant receiving. You’ll see the invoice after they
                              receive.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <div className="text-xl sm:text-2xl font-bold text-[var(--brand-mid)]">
                          {`$${formatPrice(order.total_amount)}`}
                        </div>
                        <div className="text-sm text-[var(--text-muted)]">
                          {order.items?.length || 0} items
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      {/* Order Items Preview */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[var(--text-muted)] mb-2">Items:</div>
                        <div className="flex flex-wrap gap-2">
                          {order.items?.slice(0, 3).map((item: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {item.product_name} × {item.quantity}
                            </Badge>
                          ))}
                          {order.items && order.items.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{order.items.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:justify-end">
                        {isSupplier && canEditOrders && order.status === 'PLACED' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleStatusUpdate(order.id, 'ACKNOWLEDGED')}
                              data-testid={`order-${order.id}-acknowledge`}
                            >
                              Acknowledge
                            </Button>
                            {canDeclineOrder && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setDeclineOrderId(order.id)
                                  setDeclineOrderLabel(order.restaurant_name)
                                }}
                                data-testid={`order-${order.id}-decline`}
                              >
                                Decline
                              </Button>
                            )}
                          </>
                        )}
                        {isSupplier && canEditOrders && order.status === 'ACKNOWLEDGED' && (
                          <Button
                            size="sm"
                            onClick={() => handleStatusUpdate(order.id, 'PROCESSING')}
                            data-testid={`order-${order.id}-start-processing`}
                          >
                            Start Processing
                          </Button>
                        )}
                        {isSupplier && canEditOrders && order.status === 'PROCESSING' && (
                          <Button
                            size="sm"
                            onClick={() => handleStatusUpdate(order.id, 'SHIPPED')}
                            data-testid={`order-${order.id}-ship`}
                          >
                            Mark as Shipped
                          </Button>
                        )}
                        {isSupplier &&
                          canEditOrders &&
                          order.status === 'SHIPPED' &&
                          updatingOrderId !== order.id && (
                            <Button
                              size="sm"
                              onClick={() => handleStatusUpdate(order.id, 'DELIVERED')}
                              disabled={false}
                              data-testid={`order-${order.id}-deliver`}
                            >
                              Mark Delivered
                            </Button>
                          )}
                        {isSupplier &&
                          (updatingOrderId === order.id || order.status === 'DELIVERED') && (
                            <Button
                              size="sm"
                              variant={order.status === 'DELIVERED' ? 'outline' : 'default'}
                              disabled
                              className="cursor-not-allowed opacity-75"
                            >
                              {updatingOrderId === order.id ? (
                                <>Updating...</>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Delivered
                                </>
                              )}
                            </Button>
                          )}
                        {!isSupplier && order.status === 'PLACED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendReminder(order.id)}
                          >
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {order.reminder_count > 0
                              ? `Remind (${order.reminder_count})`
                              : 'Send Reminder'}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/app/orders/${order.id}`}>
                            <FileText className="h-4 w-4 mr-1" />
                            View Details
                          </Link>
                        </Button>
                        {isSupplier && (
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/app/orders/${order.id}?tab=packing`}>
                              <Package className="h-4 w-4 mr-1" />
                              Packing Slip
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {(!filteredOrders || filteredOrders.length === 0) && (
              <EmptyState
                title={
                  debouncedSearch || status || hasAdvancedFilters || activeTab !== 'all'
                    ? 'No orders match your filters'
                    : 'No orders yet'
                }
                description={
                  debouncedSearch || status || hasAdvancedFilters || activeTab !== 'all'
                    ? 'Try adjusting search, status, or date filters.'
                    : !isSupplier
                      ? 'Create your first order to get started.'
                      : 'Orders from restaurants will appear here.'
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
                        Create first order
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Manual Order Creation Dialog */}
        {isSupplier && (
          <Dialog open={showManualOrderDialog} onOpenChange={setShowManualOrderDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Manual Order</DialogTitle>
                <DialogDescription>
                  Create an order for a restaurant that follows you or has ordered from you before
                  (phone calls, chat orders, etc.)
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Restaurant Selection */}
                <div className="space-y-2">
                  <Label htmlFor="restaurant">Restaurant *</Label>
                  <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                    <SelectTrigger id="restaurant">
                      <option value="">
                        {(restaurantsData?.restaurants?.length ?? 0) === 0
                          ? 'No eligible restaurants yet'
                          : 'Select a restaurant'}
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
                      Restaurants appear here after they follow your supplier profile or place their
                      first order with you.
                    </p>
                  )}
                </div>

                {/* Order Notes */}
                <div className="space-y-2">
                  <Label htmlFor="orderNotes">Order Notes</Label>
                  <textarea
                    id="orderNotes"
                    rows={3}
                    className="w-full px-3 py-2 border border-[var(--app-border-mid)] rounded-md"
                    placeholder="Additional notes for this order..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                  />
                </div>

                {/* Products in Order */}
                {manualOrderItems.length > 0 && (
                  <div className="space-y-2">
                    <Label>Products in Order</Label>
                    <div className="border rounded-md divide-y">
                      {manualOrderItems.map((item) => (
                        <div key={item.productId} className="flex items-center justify-between p-3">
                          <div className="flex-1">
                            <p className="font-medium">{item.productName}</p>
                            <p className="text-sm text-[var(--text-muted)]">
                              ${formatPrice(item.price)} each
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
                  Add Products
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
                  Cancel
                </Button>
                <Button
                  disabled={
                    !selectedRestaurant || manualOrderItems.length === 0 || isCreatingManualOrder
                  }
                  onClick={handleCreateOrder}
                >
                  {isCreatingManualOrder ? 'Creating...' : 'Create Order'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Product Selection Dialog */}
        <Dialog open={showProductSelection} onOpenChange={setShowProductSelection}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Products</DialogTitle>
              <DialogDescription>Search and add products to the order</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  placeholder="Search products..."
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
                        toast.success(`Added ${product.name} to order`)
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                ))}

                {(!filteredProducts || filteredProducts.length === 0) && (
                  <div className="text-center py-8 text-[var(--text-muted)]">No products found</div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowProductSelection(false)}>
                Done
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
      </div>
    </RequirePermission>
  )
}
