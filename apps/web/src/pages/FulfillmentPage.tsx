import { useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { formatPrice } from '../utils/format'
import { pageHeaderRowClass, splitRowClass } from '../components/ui/card-layout'
import {
  MapPin,
  CheckCircle,
  AlertCircle,
  Truck,
  ClipboardList,
  Loader2,
  Navigation,
  Clock,
  ClipboardSignature,
} from 'lucide-react'
import {
  useGetOrdersQuery,
  useGetFulfillmentBoardQuery,
  useGetFulfillmentDispatchQuery,
  useGetFulfillmentRoutesQuery,
  useGetFulfillmentExceptionsQuery,
  useGetWarehousesQuery,
  useGetSupplierFulfillmentQuery,
} from '../services/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { isMultiWarehouseActive } from '../lib/planLimits'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DriverDispatchBoard } from '../components/fulfillment/DriverDispatchBoard'
import { RequirePermission } from '../components/RequirePermission'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'

type ColumnId = 'unassigned' | `driver-${string}`

type ColumnEntry = {
  driver: DispatchDriver
  route: DispatchRoute | null
  stops: DispatchStop[]
}

type ActiveDragItem =
  | {
      type: 'order'
      order: DispatchOrderSummary
      columnId: ColumnId
    }
  | {
      type: 'stop'
      stop: DispatchStop
      columnId: ColumnId
      routeId: string
    }

type DispatchStopStatus = 'PLANNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'

type DispatchRouteStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

type DispatchStop = {
  id: string
  route_id: string
  order_id: string
  status: DispatchStopStatus
  restaurant_name: string
  total_amount: number
  eta_seconds?: number
}

type DispatchRoute = {
  id: string
  route_number: string
  driver_id?: string
  status: DispatchRouteStatus
  scheduled_date: string
  stops: DispatchStop[]
}

type DispatchDriverStatus = 'ACTIVE' | 'OFFSHIFT' | 'INACTIVE'

type DispatchDriver = {
  id: string
  name: string
  phone?: string
  vehicle?: string
  status: DispatchDriverStatus
  activeRoute?: DispatchRoute | null
}

type DispatchOrderSummary = {
  id: string
  status: string
  total_amount: number
  created_at: string
  restaurant_name: string
  item_count: number
}

type DispatchBoard = {
  drivers: DispatchDriver[]
  routes: DispatchRoute[]
  unassignedOrders: DispatchOrderSummary[]
  stats: {
    pending: number
    outForDelivery: number
    deliveredToday: number
  }
}

export function FulfillmentPage() {
  const [activeTab, setActiveTab] = useState('dispatch')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')
  const [proofStop, setProofStop] = useState<DispatchStop | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [capturingProof, setCapturingProof] = useState(false)
  const [activeDrag, setActiveDrag] = useState<ActiveDragItem | null>(null)

  const { entitlements } = useEntitlements()
  const { data: warehousesData } = useGetWarehousesQuery()
  const { data: fulfillmentData } = useGetSupplierFulfillmentQuery()

  const warehouses = warehousesData?.warehouses ?? []
  const multiWarehouseActive = isMultiWarehouseActive(entitlements, fulfillmentData?.fulfillment)
  const warehouseFilter =
    multiWarehouseActive && selectedWarehouseId ? { warehouseId: selectedWarehouseId } : undefined

  const { data: ordersData } = useGetOrdersQuery({ limit: 1000, offset: 0 })
  const { data: boardResponse, isLoading: boardLoading } =
    useGetFulfillmentBoardQuery(warehouseFilter)
  const { data: dispatchData, isLoading: dispatchLoading } =
    useGetFulfillmentDispatchQuery(warehouseFilter)
  const { data: routesResponse } = useGetFulfillmentRoutesQuery(warehouseFilter)
  const { data: exceptionsResponse } = useGetFulfillmentExceptionsQuery(warehouseFilter)

  const boardData = (boardResponse as DispatchBoard | undefined) ?? null
  const routeSummaries = routesResponse?.routes ?? []
  const exceptions = exceptionsResponse?.exceptions ?? []

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const shippedOrders = useMemo(() => {
    if (!ordersData?.orders) return []
    return ordersData.orders
      .filter((order: { status: string }) =>
        ['SHIPPED', 'ACKNOWLEDGED', 'PROCESSING'].includes(order.status)
      )
      .map(
        (order: {
          id: string
          status: string
          restaurant_name?: string
          total_amount?: number
          items?: unknown[]
          placed_at?: string
          created_at?: string
        }) => {
          const restaurantName = order.restaurant_name || 'Restaurant'
          const totalAmount = Number(order.total_amount) || 0
          const itemCount = Array.isArray(order.items) ? order.items.length : 0

          return {
            id: order.id,
            orderNumber: order.id.slice(0, 8).toUpperCase(),
            restaurantName,
            restaurant_name: restaurantName,
            status: order.status,
            totalAmount,
            total_amount: totalAmount,
            itemCount,
            item_count: itemCount,
            placedAt: order.placed_at || order.created_at,
            order,
          }
        }
      )
  }, [ordersData])

  const columnData = useMemo(() => {
    const map = new Map<ColumnId, ColumnEntry>()
    if (!boardData) return map

    const routesByDriver = new Map<string, DispatchRoute>()
    boardData.routes.forEach((route) => {
      if (route.driver_id && ['PLANNED', 'IN_PROGRESS'].includes(route.status)) {
        routesByDriver.set(route.driver_id, route)
      }
    })

    boardData.drivers.forEach((driver) => {
      const route = driver.activeRoute || routesByDriver.get(driver.id) || null
      const stops = route?.stops ?? []
      map.set(`driver-${driver.id}` as ColumnId, { driver, route, stops })
    })

    return map
  }, [boardData])

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as ActiveDragItem | undefined
    if (data) {
      setActiveDrag(data)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null)
    const activeData = event.active.data.current as ActiveDragItem | undefined

    if (!activeData) return

    if (activeData.type === 'order') {
      toast.success('Order assignment updated (demo experience).')
    } else if (activeData.type === 'stop') {
      toast.success('Stop reposition recorded (demo experience).')
    }
  }

  const handleRouteStatusChange = (routeId: string, status: 'IN_PROGRESS' | 'COMPLETED') => {
    const readable = status === 'IN_PROGRESS' ? 'in progress' : 'completed'
    toast.success(`Route ${routeId} marked as ${readable} (demo).`)
  }

  const handleStopStatusChange = (stopId: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED') => {
    const readable = status.replace(/_/g, ' ').toLowerCase()
    toast.success(`Stop ${stopId} marked as ${readable} (demo).`)
  }

  const handleSubmitProof = () => {
    if (!proofStop) return
    if (!recipientName.trim()) {
      toast.error('Recipient name is required')
      return
    }

    setCapturingProof(true)
    toast.success('Proof of delivery captured (demo).')
    setCapturingProof(false)
    setProofStop(null)
    setRecipientName('')
    setProofNotes('')
  }

  return (
    <RequirePermission permission="FULFILLMENT_VIEW" title="fulfillment">
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Fulfillment & Logistics</h1>
          <p className="text-[var(--text-muted)] mt-2">
            Pick lists, driver dispatch, and delivery tracking.
          </p>
        </div>

        {multiWarehouseActive && warehouses.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="fulfillment-warehouse"
              className="text-sm font-medium text-[var(--text)]"
            >
              Warehouse
            </label>
            <select
              id="fulfillment-warehouse"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm min-w-[220px]"
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouses.map((wh: { id: string; name: string }) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dispatch">Driver Dispatch</TabsTrigger>
            <TabsTrigger value="picklists">Pick Lists</TabsTrigger>
            <TabsTrigger value="routes">Routes</TabsTrigger>
            <TabsTrigger value="tracking">Delivery Tracking</TabsTrigger>
            <TabsTrigger value="exceptions" className="relative">
              Exceptions
              {(exceptionsResponse?.openCount ?? 0) > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--red)] px-1 text-[10px] font-bold text-white">
                  {exceptionsResponse?.openCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dispatch" className="space-y-4">
            {dispatchData ? (
              <DriverDispatchBoard
                data={dispatchData}
                warehouseId={warehouseFilter?.warehouseId}
                isLoading={dispatchLoading}
              />
            ) : (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-mid)]" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="picklists" className="space-y-4">
            <Card>
              <CardHeader>
                <div className={splitRowClass}>
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 shrink-0" />
                      Pick Lists
                    </CardTitle>
                    <CardDescription>Mobile-friendly picking interface</CardDescription>
                  </div>
                  <Input placeholder="Search pick list..." className="w-full sm:w-64 shrink-0" />
                </div>
              </CardHeader>
              <CardContent>
                {shippedOrders.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-muted)]">
                    No orders ready for picking. Orders will appear here when they reach SHIPPED
                    status.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {shippedOrders.map((order) => (
                      <div
                        key={order.id}
                        className="border rounded-lg p-4 hover:bg-[var(--brand-ultra)]"
                      >
                        <div className={splitRowClass}>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <Link to={`/app/orders/${order.id}`} className="min-w-0">
                                <h4 className="font-semibold hover:text-[var(--brand-mid)] cursor-pointer truncate">
                                  #{order.orderNumber}
                                </h4>
                              </Link>
                              <Badge
                                variant={
                                  order.status === 'SHIPPED'
                                    ? 'default'
                                    : order.status === 'PROCESSING'
                                      ? 'secondary'
                                      : 'outline'
                                }
                              >
                                {order.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-[var(--text-muted)] space-y-1">
                              <p>Restaurant: {order.restaurantName}</p>
                              <p>
                                Items: {order.itemCount} | Total: {formatPrice(order.totalAmount)}
                              </p>
                              <p>Placed: {new Date(order.placedAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="whitespace-normal"
                              asChild
                            >
                              <Link to={`/app/orders/${order.id}`}>View Details</Link>
                            </Button>
                            <Button variant="outline" size="sm" className="whitespace-normal">
                              View Mobile
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="routes" className="space-y-4">
            <Card>
              <CardHeader>
                <div className={splitRowClass}>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Delivery Routes
                    </CardTitle>
                    <CardDescription>Route planning and sequencing</CardDescription>
                  </div>
                  <Button>Plan New Route</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {routeSummaries.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-muted)]">
                      No delivery routes planned yet.
                    </div>
                  ) : (
                    routeSummaries.map((route) => (
                      <div key={route.id} className="border rounded-lg p-4">
                        <div className={splitRowClass}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h4 className="font-semibold">{route.routeNumber}</h4>
                              <Badge
                                variant={route.status === 'IN_PROGRESS' ? 'default' : 'secondary'}
                              >
                                {route.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-[var(--text-muted)] space-y-1">
                              <p>Driver: {route.driver}</p>
                              <p>
                                Vehicle: {route.vehicle} | Stops: {route.stops}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            <Button variant="outline" size="sm" className="whitespace-normal">
                              View Map
                            </Button>
                            <Button variant="outline" size="sm" className="whitespace-normal">
                              Manifest
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tracking" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Delivery Tracking & POD
                </CardTitle>
                <CardDescription>Real-time delivery status and proof of delivery</CardDescription>
              </CardHeader>
              <CardContent>
                {shippedOrders.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-muted)]">
                    No deliveries currently in transit
                  </div>
                ) : (
                  <div className="space-y-4">
                    {shippedOrders
                      .filter((o) => o.status === 'SHIPPED')
                      .map((order) => (
                        <div key={order.id} className="border rounded-lg p-4">
                          <div className={splitRowClass}>
                            <div className="flex-1 min-w-0">
                              <Link to={`/app/orders/${order.id}`}>
                                <h4 className="font-semibold hover:text-[var(--brand-mid)] cursor-pointer truncate">
                                  Order #{order.orderNumber}
                                </h4>
                              </Link>
                              <div className="text-sm text-[var(--text-muted)] space-y-1 mt-1">
                                <p>Restaurant: {order.restaurantName}</p>
                                <p>
                                  Items: {order.itemCount} | Total: {formatPrice(order.totalAmount)}
                                </p>
                                <p>Status: {order.status}</p>
                              </div>
                            </div>
                            <Badge variant="default" className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Shipped
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exceptions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Delivery Exceptions & Returns
                </CardTitle>
                <CardDescription>Handle short/over deliveries and returns</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {exceptions.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-muted)]">
                      No delivery exceptions recorded.
                    </div>
                  ) : (
                    exceptions.map((ex) => (
                      <div key={ex.id} className="border rounded-lg p-4">
                        <div className={splitRowClass}>
                          <div className="min-w-0">
                            <h4 className="font-semibold break-words">
                              {ex.orderLabel} - {ex.exceptionType.replace(/_/g, ' ')}
                            </h4>
                            <div className="text-sm text-[var(--text-muted)] space-y-1 mt-1">
                              {ex.productName && <p>Product: {ex.productName}</p>}
                              {(ex.quantityExpected != null || ex.quantityActual != null) && (
                                <p>
                                  Expected: {ex.quantityExpected ?? '-'}, Actual:{' '}
                                  {ex.quantityActual ?? '-'}
                                </p>
                              )}
                              {ex.damageDescription && <p>{ex.damageDescription}</p>}
                              {ex.notes && <p>{ex.notes}</p>}
                            </div>
                          </div>
                          <Badge variant="destructive">Exception</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={!!proofStop}
          onOpenChange={(open) => {
            if (!open) {
              setProofStop(null)
              setRecipientName('')
              setProofNotes('')
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Capture proof of delivery</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="recipientName">Recipient name</Label>
                <Input
                  id="recipientName"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  placeholder="Who signed for the delivery?"
                />
              </div>
              <div>
                <Label htmlFor="proofNotes">Notes (optional)</Label>
                <Textarea
                  id="proofNotes"
                  value={proofNotes}
                  onChange={(event) => setProofNotes(event.target.value)}
                  rows={3}
                  placeholder="Any additional details (e.g. temperature, issues, etc.)"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setProofStop(null)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitProof} disabled={capturingProof}>
                {capturingProof && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save proof
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  )
}

type DispatchBoardViewProps = {
  board: DispatchBoard
  columns: Map<ColumnId, ColumnEntry>
  sensors: ReturnType<typeof useSensors>
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void
  onRouteStatusChange: (routeId: string, status: 'IN_PROGRESS' | 'COMPLETED') => void
  onStopStatusChange: (stopId: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED') => void
  onCaptureProof: (stop: DispatchStop) => void
  activeDrag: ActiveDragItem | null
}

function DispatchBoardView({
  board,
  columns,
  sensors,
  onDragStart,
  onDragEnd,
  onRouteStatusChange,
  onStopStatusChange,
  onCaptureProof,
  activeDrag,
}: DispatchBoardViewProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pending assignments</CardTitle>
            <CardDescription>Not yet assigned to a driver</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-[var(--text)]">{board.stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Out for delivery</CardTitle>
            <CardDescription>Stops currently en route</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-[var(--text)]">
              {board.stats.outForDelivery}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delivered today</CardTitle>
            <CardDescription>Completed drops with proof</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-[var(--text)]">
              {board.stats.deliveredToday}
            </p>
          </CardContent>
        </Card>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid gap-4 md:grid-cols-[minmax(240px,280px)_1fr]">
          <DispatchColumn
            id="unassigned"
            title="Unassigned"
            description="Drag onto a driver to assign"
            badgeValue={board.unassignedOrders.length}
            items={board.unassignedOrders.map((order) => `order-${order.id}`)}
          >
            <SortableContext
              items={board.unassignedOrders.map((order) => `order-${order.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {board.unassignedOrders.length === 0 ? (
                <EmptyState message="All orders are assigned." />
              ) : (
                board.unassignedOrders.map((order) => (
                  <DraggableOrderCard key={order.id} order={order} columnId="unassigned" />
                ))
              )}
            </SortableContext>
          </DispatchColumn>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {board.drivers.map((driver) => {
              const columnId = `driver-${driver.id}` as ColumnId
              const column = columns.get(columnId)
              const route = column?.route ?? null
              const stops = column?.stops ?? []

              return (
                <DispatchColumn
                  key={driver.id}
                  id={columnId}
                  title={driver.name}
                  description={route ? `Route ${route.route_number}` : 'No route yet'}
                  badgeValue={stops.length}
                  driver={driver}
                  route={route}
                  onRouteStatusChange={onRouteStatusChange}
                  items={stops.map((stop) => `stop-${stop.id}`)}
                >
                  <SortableContext
                    items={stops.map((stop) => `stop-${stop.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {stops.length === 0 ? (
                      <EmptyState message="Drop orders here to build the run." />
                    ) : (
                      stops.map((stop) => (
                        <DraggableStopCard
                          key={stop.id}
                          stop={stop}
                          columnId={columnId}
                          onStatusChange={onStopStatusChange}
                          onCaptureProof={onCaptureProof}
                        />
                      ))
                    )}
                  </SortableContext>
                </DispatchColumn>
              )
            })}
          </div>
        </div>

        {activeDrag?.type === 'order' && (
          <DragOverlayCard>
            <OrderCard order={activeDrag.order} compact />
          </DragOverlayCard>
        )}
        {activeDrag?.type === 'stop' && (
          <DragOverlayCard>
            <StopCard stop={activeDrag.stop} compact />
          </DragOverlayCard>
        )}
      </DndContext>
    </div>
  )
}

type DispatchColumnProps = {
  id: ColumnId
  title: string
  description?: string
  badgeValue: number
  items: string[]
  driver?: DispatchDriver
  route?: DispatchRoute | null
  children: React.ReactNode
  onRouteStatusChange?: (routeId: string, status: 'IN_PROGRESS' | 'COMPLETED') => void
}

function DispatchColumn({
  id,
  title,
  description,
  badgeValue,
  items,
  driver,
  route,
  children,
  onRouteStatusChange,
}: DispatchColumnProps) {
  return (
    <div className="space-y-3" data-column={id}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
          {description && <p className="text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
        <Badge variant="outline">{badgeValue}</Badge>
      </div>

      {driver && route && onRouteStatusChange && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-[var(--brand-mid)]" />
            <div>
              <p className="font-medium text-[var(--text)]">{route.route_number}</p>
              <p>
                <span className="font-semibold text-[var(--text)]">{route.status}</span> · Scheduled{' '}
                {new Date(route.scheduled_date).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {route.status === 'PLANNED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRouteStatusChange(route.id, 'IN_PROGRESS')}
              >
                Start
              </Button>
            )}
            {route.status === 'IN_PROGRESS' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRouteStatusChange(route.id, 'COMPLETED')}
              >
                Complete
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-[220px] rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] p-3">
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--surface)] text-sm text-[var(--text-muted)]">
      {message}
    </div>
  )
}

function OrderCard({ order, compact = false }: { order: DispatchOrderSummary; compact?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-3 shadow-sm ${compact ? 'w-64' : ''}`}
    >
      <p className="text-sm font-semibold text-[var(--text)]">{order.restaurant_name}</p>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Order #{order.id.slice(0, 6).toUpperCase()}
      </p>
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>{formatPrice(order.total_amount)}</span>
        <span>{order.item_count} items</span>
      </div>
    </div>
  )
}

function StopCard({
  stop,
  compact = false,
  onStatusChange,
  onCaptureProof,
}: {
  stop: DispatchStop
  compact?: boolean
  onStatusChange?: (stopId: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED') => void
  onCaptureProof?: (stop: DispatchStop) => void
}) {
  const statusColors: Record<string, string> = {
    PLANNED: 'bg-[var(--brand-pale)] text-[var(--brand-mid)]',
    OUT_FOR_DELIVERY: 'bg-amber-100 text-amber-600',
    DELIVERED: 'bg-[var(--mint-pale)] text-[var(--mint)]',
    FAILED: 'bg-[var(--red-pale)] text-[var(--red)]',
  }

  return (
    <div
      className={`rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-3 shadow-sm ${compact ? 'w-64' : ''}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text)]">{stop.restaurant_name}</p>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
            statusColors[stop.status] ?? 'bg-[var(--brand-ultra)] text-[var(--text-muted)]'
          }`}
        >
          {stop.status.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Order #{stop.order_id.slice(0, 6).toUpperCase()}
      </p>
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>{formatPrice(stop.total_amount)}</span>
        {stop.eta_seconds ? <span>{Math.round(stop.eta_seconds / 60)} min eta</span> : null}
      </div>
      {!compact && onStatusChange && (
        <div className="mt-3 flex flex-wrap gap-2">
          {stop.status === 'PLANNED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange(stop.id, 'OUT_FOR_DELIVERY')}
            >
              <Clock className="mr-1 h-3 w-3" />
              Out for delivery
            </Button>
          )}
          {stop.status === 'OUT_FOR_DELIVERY' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange(stop.id, 'DELIVERED')}
            >
              <CheckCircle className="mr-1 h-3 w-3" />
              Delivered
            </Button>
          )}
          {stop.status === 'DELIVERED' && onCaptureProof && (
            <Button size="sm" variant="outline" onClick={() => onCaptureProof(stop)}>
              <ClipboardSignature className="mr-1 h-3 w-3" />
              Proof
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function DragOverlayCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none rounded-lg border border-[var(--brand)]/40 bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur">
      {children}
    </div>
  )
}

function DraggableOrderCard({
  order,
  columnId,
}: {
  order: DispatchOrderSummary
  columnId: ColumnId
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `order-${order.id}`,
    data: {
      type: 'order',
      order,
      columnId,
    } satisfies ActiveDragItem,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <OrderCard order={order} />
    </div>
  )
}

function DraggableStopCard({
  stop,
  columnId,
  onStatusChange,
  onCaptureProof,
}: {
  stop: DispatchStop
  columnId: ColumnId
  onStatusChange: (stopId: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED') => void
  onCaptureProof: (stop: DispatchStop) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `stop-${stop.id}`,
    data: {
      type: 'stop',
      stop,
      columnId,
      routeId: stop.route_id,
    } satisfies ActiveDragItem,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <StopCard stop={stop} onStatusChange={onStatusChange} onCaptureProof={onCaptureProof} />
    </div>
  )
}
