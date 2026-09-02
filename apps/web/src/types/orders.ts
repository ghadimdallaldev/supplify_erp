// Order types
export interface Order {
  id: string
  restaurant_id: string
  status: 'DRAFT' | 'PLACED' | 'ACKNOWLEDGED' | 'PROCESSING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'
  total_amount: number
  currency: string
  placed_at?: string
  created_at: string
  updated_at: string
  restaurant_name?: string
  restaurant_slug?: string
  cancel_reason?: string | null
  cancelled_by?: 'RESTAURANT' | 'SUPPLIER' | null
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  supplier_id: string
  quantity: number
  unit_price: number
  line_total: number
  notes?: string
  product_name?: string
  product_sku?: string
  supplier_name?: string
  supplier_slug?: string
}

export interface CreateOrderRequest {
  items: {
    productId: string
    quantity: number
    notes?: string
  }[]
  status?: 'DRAFT' | 'PLACED'
  promotionId?: string
  couponCode?: string
  quoteLocks?: Array<{
    productId: string
    quoteRequestSupplierId: string
    quoteResponseItemId: string
  }>
}

export interface CreateManualOrderRequest {
  restaurant_id: string
  items: {
    productId: string
    quantity: number
    notes?: string
  }[]
  notes?: string
}

export interface UpdateOrderRequest {
  status?:
    | 'DRAFT'
    | 'PLACED'
    | 'ACKNOWLEDGED'
    | 'PROCESSING'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'COMPLETED'
    | 'CANCELLED'
  notes?: string
  cancel_reason?: string
  decline_reason?: string
  delivery_status?:
    | 'assigned'
    | 'picked_up'
    | 'out_for_delivery'
    | 'delivered'
    | 'failed'
    | 'rescheduled'
  failure_reason?: string
}

export interface DriverRecord {
  id: string
  supplier_id: string
  warehouse_id?: string | null
  full_name: string
  phone?: string | null
  vehicle_type?: string | null
  vehicle_plate?: string | null
  notes?: string | null
  is_active?: boolean
  warehouse_name?: string | null
  user_id?: string | null
  linked_user_email?: string | null
  linked_user_name?: string | null
}

export interface RestaurantOrderTrackingResponse {
  orderId: string
  orderReference?: string
  orderStatus?: string | null
  trackingEnabled: boolean
  reason?: string
  etaAvailable: boolean
  destinationCoordinatesAvailable?: boolean
  destinationLabel?: string | null
  etaMinutesMin?: number | null
  etaMinutesMax?: number | null
  distanceKm?: number | null
  calculatedAt?: string | null
  stopsBefore?: number
  nextStop?: boolean
  delivery?: {
    status: string
    label: string
    assignedAt?: string | null
    pickedUpAt?: string | null
    deliveredAt?: string | null
  } | null
  driver?: { name?: string; phone?: string } | null
  tracking?: DeliveryTrackingInfo | null
}

export interface SupplierOrderTrackingResponse {
  orderId: string
  orderRef?: string
  orderStatus?: string | null
  restaurantName?: string | null
  trackingEnabled: boolean
  etaAvailable?: boolean
  destinationCoordinatesAvailable?: boolean
  destinationLabel?: string | null
  etaMinutesMin?: number | null
  etaMinutesMax?: number | null
  distanceKm?: number | null
  calculatedAt?: string | null
  confidence?: 'LOW' | 'MEDIUM' | null
  unavailableReason?: string | null
  stopsBefore?: number
  nextStop?: boolean
  routePosition?: number | null
  routePositionTotal?: number | null
  destination?: {
    latitude: number
    longitude: number
    label?: string | null
  } | null
  routeId?: string | null
  routeStopId?: string | null
  routeNumber?: string | null
  assignment?: {
    id: string
    status: string
    driverId?: string
    driverName?: string
    driverPhone?: string
    driverPhoneVisible?: boolean
  } | null
  tracking?: DeliveryTrackingInfo | null
  latestLocation?: DeliveryTrackingInfo['latestLocation']
  lastUpdatedLabel?: string | null
}

export type OrderTrackingResponse = RestaurantOrderTrackingResponse | SupplierOrderTrackingResponse

export function isRestaurantOrderTracking(
  data: OrderTrackingResponse | undefined
): data is RestaurantOrderTrackingResponse {
  return Boolean(data && 'orderReference' in data)
}

export function isSupplierOrderTracking(
  data: OrderTrackingResponse | undefined
): data is SupplierOrderTrackingResponse {
  return Boolean(data && !isRestaurantOrderTracking(data))
}

export interface DeliveryTrackingInfo {
  enabled: boolean
  hasLocation: boolean
  lastSeenAt: string | null
  isStale: boolean
  staleAfterSeconds?: number
  latestLocation: {
    latitude: number
    longitude: number
    accuracyMeters?: number | null
    speedMps?: number | null
    headingDegrees?: number | null
    recordedAt: string
  } | null
  lastUpdatedLabel?: string | null
}

export interface ProofOfDelivery {
  id: string
  order_id: string
  recipient_name?: string | null
  notes?: string | null
  file_key?: string | null
  signature_file_key?: string | null
  delivery_photo_url?: string | null
  signature_image_url?: string | null
  delivery_gps_lat?: number | null
  delivery_gps_lng?: number | null
  delivery_timestamp?: string
  confirmed_at?: string | null
  confirmed_by?: string | null
  driver_assignment_id?: string | null
}

export interface DispatchOrderCard {
  id: string
  status: string
  total_amount: number
  created_at: string
  restaurant_name: string
  item_count: number
  has_pod?: boolean
  delivery_area?: string | null
  scheduled_at?: string | null
  delivery_status?: string | null
  active_route_id?: string | null
  active_route_number?: string | null
  active_route_status?: string | null
  planned_route_only?: boolean
  route_planning_label?: string | null
  assignment?: {
    id: string
    status: string
    assigned_at?: string
    delivered_at?: string
    scheduled_delivery_date?: string | null
    rolled_over_at?: string | null
    driver: {
      id: string
      full_name: string
      phone?: string | null
      vehicle_type?: string | null
      vehicle_plate?: string | null
    }
  } | null
  tracking?: DeliveryTrackingInfo | null
  /** @deprecated Prefer `tracking` */
  driver_last_seen?: {
    recordedAt?: string
    lastUpdatedLabel?: string
    latitude?: number
    longitude?: number
    isStale?: boolean
  } | null
}

export interface DeliveryRouteStop {
  id: string
  routeId: string
  orderId: string
  orderNumber?: string
  sequenceNumber: number
  status: string
  restaurantName: string
  deliveryArea?: string | null
  addressLine?: string | null
  totalAmount: number
  itemCount: number
  notes?: string | null
  assignmentStatus?: string | null
  tracking?: DeliveryTrackingInfo | null
  destinationCoordinatesAvailable?: boolean
  etaAvailable?: boolean
  etaMinutesMin?: number | null
  etaMinutesMax?: number | null
  isNext?: boolean
  isCompleted?: boolean
}

export interface DeliveryRouteSummary {
  id: string
  routeNumber: string
  routeLabel: string
  area?: string | null
  driverId?: string | null
  driverName: string
  vehicle?: string | null
  status: string
  scheduledDate: string
  stops: number
  completedStops: number
  failedStops: number
  rescheduledStops: number
}

export interface DeliveryRouteDetail extends Omit<DeliveryRouteSummary, 'stops'> {
  stops: DeliveryRouteStop[]
  tracking?: DeliveryTrackingInfo | null
  startedAt?: string | null
  completedAt?: string | null
}

export interface OrderFilters {
  status?: string
  supplier?: string
  restaurant?: string
  q?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
  includeItems?: boolean
  warehouseId?: string
  warehouse_id?: string
}

export interface OrdersResponse {
  orders: Order[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

export type CalendarStatusCategory = 'completed' | 'pending' | 'in_transit' | 'cancelled'

export interface OrdersCalendarEvent {
  id: string
  orderId?: string
  invoiceId?: string
  type:
    | 'RECEIVED_ORDER'
    | 'DELIVERY_SCHEDULE'
    | 'PAYMENT_DUE'
    | 'PURCHASE_ORDER'
    | 'DELIVERY_PICKUP'
    | 'PAYMENT_COLLECTION'
  source: 'ORDER' | 'INVOICE'
  title: string
  status: string
  statusCategory: CalendarStatusCategory
  start: string
  end?: string
  totalAmount: number
  currency?: string
  counterpartName?: string
  supplierId?: string
  supplierName?: string
  supplierList?: Array<{ id: string; name: string }>
  branchId?: string
  branchName?: string
  categories?: string[]
  role: 'RESTAURANT' | 'SUPPLIER'
}

export interface OrdersCalendarFilters {
  page?: number
  pageSize?: number
  start?: string
  end?: string
  status?: string
  supplier?: string
  branch?: string
  category?: string
  role?: 'RESTAURANT' | 'SUPPLIER'
  view?: string
}

export interface OrdersCalendarResponse {
  events: OrdersCalendarEvent[]
  pagination: {
    total: number
    page: number
    pageSize: number
  }
  filters: {
    statuses: string[]
    suppliers: Array<{ id: string; name: string }>
    branches: Array<{ id: string; name: string }>
    categories: string[]
  }
}
