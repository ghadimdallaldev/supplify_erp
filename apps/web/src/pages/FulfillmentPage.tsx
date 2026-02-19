import { useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { formatPrice } from '../utils/format'
import {
  Package,
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
import { useGetOrdersQuery } from '../services/api'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
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
  const [proofStop, setProofStop] = useState<DispatchStop | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [capturingProof, setCapturingProof] = useState(false)
  const [activeDrag, setActiveDrag] = useState<ActiveDragItem | null>(null)

  const { data: ordersData } = useGetOrdersQuery({ limit: 1000, offset: 0 })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const shippedOrders = useMemo(() => {
    if (!ordersData?.orders) return []
    return ordersData.orders
      .filter((order: { status: string }) => ['SHIPPED', 'ACKNOWLEDGED', 'PROCESSING'].includes(order.status))
      .map((order: { id: string; status: string; restaurant_name?: string; total_amount?: number; items?: unknown[]; placed_at?: string; created_at?: string }) => {
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
      })
  }, [ordersData])

  const unassignedOrders = useMemo<DispatchOrderSummary[]>(() => {
    return shippedOrders.map((order) => ({
      id: order.id,
      status: order.status,
      total_amount: order.total_amount,
      created_at: order.placedAt,
      restaurant_name: order.restaurant_name,
      item_count: order.item_count,
    }))
  }, [shippedOrders])

  const boardData = useMemo<DispatchBoard>(() => {
    const routes: DispatchRoute[] = [
      {
        id: 'route-1',
        route_number: 'R-2024-101',
        driver_id: 'driver-1',
        status: 'IN_PROGRESS',
        scheduled_date: new Date().toISOString(),
        stops: [
          {
            id: 'stop-101',
            route_id: 'route-1',
            order_id: 'ORD-301',
            restaurant_name: 'Downtown Deli',
            total_amount: 320,
            status: 'OUT_FOR_DELIVERY',
            eta_seconds: 1800,
          },
          {
            id: 'stop-102',
            route_id: 'route-1',
            order_id: 'ORD-302',
            restaurant_name: 'Urban Eats',
            total_amount: 245,
            status: 'PLANNED',
          },
        ],
      },
      {
        id: 'route-2',
        route_number: 'R-2024-205',
        driver_id: 'driver-2',
        status: 'PLANNED',
        scheduled_date: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
        stops: [
          {
            id: 'stop-201',
            route_id: 'route-2',
            order_id: 'ORD-401',
            restaurant_name: 'Metro Burger',
            total_amount: 180,
            status: 'PLANNED',
          },
        ],
      },
    ]

    const drivers: DispatchDriver[] = [
      {
        id: 'driver-1',
        name: 'Mike Driver',
        phone: '+971 50 123 4567',
        vehicle: 'Sprinter Van 01',
        status: 'ACTIVE',
        activeRoute: routes[0],
      },
      {
        id: 'driver-2',
        name: 'Sarah Driver',
        phone: '+971 50 987 6543',
        vehicle: 'Refrigerated Van 12',
        status: 'ACTIVE',
        activeRoute: routes[1],
      },
      {
        id: 'driver-3',
        name: 'Hassan Ali',
        phone: '+971 55 222 3344',
        vehicle: 'Bike Courier 3',
        status: 'OFFSHIFT',
        activeRoute: null,
      },
    ]

    const stats = {
      pending: unassignedOrders.length,
      outForDelivery: routes.reduce(
        (sum, route) => sum + route.stops.filter((stop) => stop.status === 'OUT_FOR_DELIVERY').length,
        0,
      ),
      deliveredToday: 4,
    }

    return {
      drivers,
      routes,
      unassignedOrders,
      stats,
    }
  }, [unassignedOrders])

  const boardLoading = false

  const waves = [
    {
      id: '1',
      waveNumber: 'W-2024-001',
      scheduledDate: '2024-12-28',
      status: 'PICKING',
      orderCount: shippedOrders.length || 0,
    },
    { id: '2', waveNumber: 'W-2024-002', scheduledDate: '2024-12-29', status: 'PENDING', orderCount: 0 },
  ]

  const routeSummaries = [
    { id: '1', routeNumber: 'R-2024-01', driver: 'Mike Driver', vehicle: 'Van-001', status: 'IN_PROGRESS', stops: 8 },
    { id: '2', routeNumber: 'R-2024-02', driver: 'Sarah Driver', vehicle: 'Van-002', status: 'PLANNED', stops: 5 },
  ]

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
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Fulfillment & Logistics</h1>
        <p className="text-gray-600 mt-2">Wave planning, mobile pick lists, and driver dispatch.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dispatch">Driver Dispatch</TabsTrigger>
          <TabsTrigger value="waves">Waves</TabsTrigger>
          <TabsTrigger value="picklists">Pick Lists</TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="tracking">Delivery Tracking</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
        </TabsList>

        <TabsContent value="dispatch" className="space-y-4">
          {boardLoading || !boardData ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : (
            <DispatchBoardView
              board={boardData}
              columns={columnData}
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onRouteStatusChange={handleRouteStatusChange}
              onStopStatusChange={handleStopStatusChange}
              onCaptureProof={setProofStop}
              activeDrag={activeDrag}
            />
          )}
        </TabsContent>

        <TabsContent value="waves" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Delivery Waves
                  </CardTitle>
                  <CardDescription>Batch orders for efficient picking</CardDescription>
                </div>
                <Button>Create New Wave</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {waves.map((wave) => (
                  <div key={wave.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{wave.waveNumber}</h4>
                          <Badge variant={wave.status === 'PICKING' ? 'default' : 'secondary'}>
                            {wave.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Scheduled: {wave.scheduledDate}</p>
                          <p>Orders: {wave.orderCount}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="picklists" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Pick Lists
                  </CardTitle>
                  <CardDescription>Mobile-friendly picking interface</CardDescription>
                </div>
                <Input placeholder="Search pick list..." className="w-64" />
              </div>
            </CardHeader>
            <CardContent>
              {shippedOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No orders ready for picking. Orders will appear here when they reach SHIPPED status.
                </div>
              ) : (
                <div className="space-y-4">
                  {shippedOrders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Link to={`/app/orders/${order.id}`}>
                              <h4 className="font-semibold hover:text-primary cursor-pointer">
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
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>Restaurant: {order.restaurantName}</p>
                            <p>
                              Items: {order.itemCount} | Total: {formatPrice(order.totalAmount)}
                            </p>
                            <p>Placed: {new Date(order.placedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/app/orders/${order.id}`}>View Details</Link>
                          </Button>
                          <Button variant="outline" size="sm">
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
              <div className="flex items-center justify-between">
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
                {routeSummaries.map((route) => (
                  <div key={route.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{route.routeNumber}</h4>
                          <Badge variant={route.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>
                            {route.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Driver: {route.driver}</p>
                          <p>
                            Vehicle: {route.vehicle} | Stops: {route.stops}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          View Map
                        </Button>
                        <Button variant="outline" size="sm">
                          Manifest
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
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
                <div className="text-center py-8 text-gray-500">No deliveries currently in transit</div>
              ) : (
                <div className="space-y-4">
                  {shippedOrders
                    .filter((o) => o.status === 'SHIPPED')
                    .map((order) => (
                      <div key={order.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Link to={`/app/orders/${order.id}`}>
                              <h4 className="font-semibold hover:text-primary cursor-pointer">
                                Order #{order.orderNumber}
                              </h4>
                            </Link>
                            <div className="text-sm text-gray-600 space-y-1 mt-1">
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
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">ORD-125 - Short Delivery</h4>
                      <div className="text-sm text-gray-600 space-y-1 mt-1">
                        <p>Type: Short Quantity</p>
                        <p>Product: Organic Tomatoes</p>
                        <p>Expected: 10kg, Actual: 8kg</p>
                      </div>
                    </div>
                    <Badge variant="destructive">Exception</Badge>
                  </div>
                </div>
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
            <p className="text-2xl font-semibold text-gray-900">{board.stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Out for delivery</CardTitle>
            <CardDescription>Stops currently en route</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-gray-900">{board.stats.outForDelivery}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delivered today</CardTitle>
            <CardDescription>Completed drops with proof</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-gray-900">{board.stats.deliveredToday}</p>
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
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
        <Badge variant="outline">{badgeValue}</Badge>
      </div>

      {driver && route && onRouteStatusChange && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-primary" />
            <div>
              <p className="font-medium text-gray-800">{route.route_number}</p>
              <p>
                <span className="font-semibold text-gray-900">{route.status}</span> • Scheduled{' '}
                {new Date(route.scheduled_date).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {route.status === 'PLANNED' && (
              <Button variant="outline" size="sm" onClick={() => onRouteStatusChange(route.id, 'IN_PROGRESS')}>
                Start
              </Button>
            )}
            {route.status === 'IN_PROGRESS' && (
              <Button variant="outline" size="sm" onClick={() => onRouteStatusChange(route.id, 'COMPLETED')}>
                Complete
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-[220px] rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white text-sm text-gray-500">
      {message}
    </div>
  )
}

function OrderCard({ order, compact = false }: { order: DispatchOrderSummary; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${compact ? 'w-64' : ''}`}>
      <p className="text-sm font-semibold text-gray-900">{order.restaurant_name}</p>
      <p className="text-xs text-gray-500 mb-2">Order #{order.id.slice(0, 6).toUpperCase()}</p>
      <div className="flex items-center justify-between text-xs text-gray-600">
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
    PLANNED: 'bg-blue-100 text-blue-600',
    OUT_FOR_DELIVERY: 'bg-amber-100 text-amber-600',
    DELIVERED: 'bg-emerald-100 text-emerald-600',
    FAILED: 'bg-red-100 text-red-600',
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${compact ? 'w-64' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">{stop.restaurant_name}</p>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
            statusColors[stop.status] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {stop.status.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-2">Order #{stop.order_id.slice(0, 6).toUpperCase()}</p>
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{formatPrice(stop.total_amount)}</span>
        {stop.eta_seconds ? <span>{Math.round(stop.eta_seconds / 60)} min eta</span> : null}
      </div>
      {!compact && onStatusChange && (
        <div className="mt-3 flex flex-wrap gap-2">
          {stop.status === 'PLANNED' && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(stop.id, 'OUT_FOR_DELIVERY')}>
              <Clock className="mr-1 h-3 w-3" />
              Out for delivery
            </Button>
          )}
          {stop.status === 'OUT_FOR_DELIVERY' && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(stop.id, 'DELIVERED')}>
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
    <div className="pointer-events-none rounded-lg border border-primary/40 bg-white/95 p-3 shadow-lg backdrop-blur">
      {children}
    </div>
  )
}

function DraggableOrderCard({ order, columnId }: { order: DispatchOrderSummary; columnId: ColumnId }) {
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
