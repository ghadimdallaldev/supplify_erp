/**
 * Supplify domain types — keep aligned with apps/web/src/types/index.ts
 */
export interface User {
  id: string
  email: string
  displayName: string
  role: 'ADMIN' | 'SUPPLIER' | 'RESTAURANT' | 'CONSUMER' | 'PENDING' | 'STAFF_PORTAL'
  tenantRoles?: string[]
  tenantPermissions?: string[]
  adminPermissions?: string[]
  locale?: 'en' | 'ar'
  workspace?: {
    tenantId: string
    tenantType: 'SUPPLIER' | 'RESTAURANT'
    tenantName: string
    roleName: string | null
  }
}

export interface ApiEnvelope<T> {
  ok: boolean
  data: T
  error: { name: string; message: string; details?: unknown } | null
  requestId?: string
}

export interface OrderCustomerProjection {
  type: 'RESTAURANT' | 'CONSUMER' | 'GUEST'
  id?: string | null
  name: string | null
  slug?: string | null
  phone?: string | null
  email?: string | null
}

/** Order lifecycle statuses (mirrors apps/web/src/types/orders.ts and the API order state machine). */
export type OrderStatus =
  | 'DRAFT'
  | 'PLACED'
  | 'ACKNOWLEDGED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'RECEIVED_PARTIAL'
  | 'RECEIVED_FULL'
  | 'RECEIVED_WITH_DISPUTE'
  | 'INVOICED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface Order {
  id: string
  restaurant_id: string | null
  customer_type?: 'RESTAURANT' | 'CONSUMER' | 'GUEST'
  customerType?: 'RESTAURANT' | 'CONSUMER' | 'GUEST'
  customer?: OrderCustomerProjection
  customer_display_name?: string
  customer_contact_snapshot?: { name?: string; phone?: string; email?: string | null } | null
  checkout_payment_method?: string | null
  subtotal_amount?: number
  delivery_fee?: number
  fulfillmentMethod?: string | null
  paymentMethod?: 'CASH_ON_DELIVERY' | 'CASH_ON_PICKUP' | 'BANK_TRANSFER' | null
  subtotal?: number
  deliveryFee?: number
  total?: number
  status: OrderStatus | (string & {})
  total_amount: number
  currency: string
  supplier_organization_id?: string | null
  branch_id?: string | null
  delivery_location_snapshot?: Record<string, unknown> | null
  requested_delivery_method?: string | null
  requested_delivery_time?: string | null
  warehouseFulfillment?: {
    warehouseId: string
    supplierTenantId?: string
    reason?: string
  } | null
  placed_at?: string
  created_at: string
  updated_at: string
  restaurant_name?: string
  supplier_name?: string
  items?: OrderItem[]
  /** M12: true when an active driver assignment exists (assigned/picked_up/out_for_delivery). */
  has_driver_assignment?: boolean
  /** M12: true when a proof-of-delivery record exists. */
  has_pod?: boolean
  /** M12: supplier policy — only gate Deliver on has_pod when this is true. */
  pod_required?: boolean
}

export interface OrderItem {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  line_total: number
  product_name?: string
  product_sku?: string
  notes?: string
}

export interface ProductCategory {
  id: string
  supplier_id?: string | null
  name: string
  slug: string
  description?: string | null
  display_order: number
  product_count?: number
}

export interface ProductCategoriesResponse {
  categories: ProductCategory[]
}
export interface Product {
  id: string
  supplier_id: string
  sku: string
  name: string
  description?: string
  category?: string
  unit?: string
  current_price?: number
  currency?: string
  supplier_name?: string
  available_qty?: number
  /** Catalog list price before contract override */
  catalog_price?: number
  pricing_source?: 'DEFAULT_PRICE' | 'CONTRACT_PRICE' | 'QUOTE_PRICE'
  contract_price_id?: string | null
  /** Supplier minimum order quantity for this SKU */
  moq?: number
  /** Pack / order multiple for this SKU */
  order_multiple?: number
  /** Supplier-level minimum order amount (from catalog join) */
  supplier_minimum_order_amount?: number | null
}

export interface Supplier {
  id: string
  name: string
  slug?: string
  organization_id?: string | null
  supplier_organization_id?: string | null
  tenant_id?: string | null
  description?: string
  minimum_order_amount?: number | null
  minimumOrderAmount?: number | null
  is_followed?: boolean
  product_count?: number
}

export interface Restaurant {
  id: string
  name: string
  slug?: string
}

export interface NotificationItem {
  id: string
  title: string
  body?: string
  read: boolean
  created_at: string
  type?: string
  reference_id?: string | null
  reference_type?: string | null
  metadata?: Record<string, unknown> | null
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
    recordedAt: string
  } | null
  lastUpdatedLabel?: string | null
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
  stopsBefore?: number
  nextStop?: boolean
  delivery?: { status: string; label: string } | null
  driver?: { name?: string; phone?: string } | null
  tracking?: DeliveryTrackingInfo | null
}

export interface SupplierOrderTrackingResponse {
  orderId: string
  orderRef?: string
  trackingEnabled: boolean
  etaAvailable?: boolean
  destinationCoordinatesAvailable?: boolean
  destinationLabel?: string | null
  etaMinutesMin?: number | null
  etaMinutesMax?: number | null
  distanceKm?: number | null
  confidence?: 'LOW' | 'MEDIUM' | null
  unavailableReason?: string | null
  stopsBefore?: number
  routePosition?: number | null
  routePositionTotal?: number | null
  destination?: { latitude: number; longitude: number; label?: string | null } | null
  assignment?: {
    id: string
    status: string
    driverName?: string
    driverPhone?: string
  } | null
  tracking?: DeliveryTrackingInfo | null
  lastUpdatedLabel?: string | null
}

export type OrderTrackingResponse = RestaurantOrderTrackingResponse | SupplierOrderTrackingResponse

export function isRestaurantOrderTracking(
  data: OrderTrackingResponse | undefined
): data is RestaurantOrderTrackingResponse {
  return Boolean(data && 'orderReference' in data)
}

export interface DriverDeliveryOrder {
  orderId: string
  restaurantName: string
  deliveryArea?: string | null
  deliveryStatus: string
  assignmentId?: string | null
  warehouseAssignmentId?: string | null
  scheduledAt?: string | null
  scheduledDeliveryDate?: string | null
  hasPod?: boolean
  itemCount?: number
  destinationLatitude?: number | null
  destinationLongitude?: number | null
  destinationLabel?: string | null
  destinationAddress?: unknown
  tracking?: DeliveryTrackingInfo | null
}

export interface DriverDeliveryDetail {
  orderId: string
  orderReference?: string | null
  orderStatus: string
  deliveryStatus?: string | null
  restaurantName: string
  branch?: { id: string; name?: string | null; address?: unknown } | null
  destination?: { coordinatesAvailable: boolean; latitude?: number | null; longitude?: number | null; label?: string | null; address?: unknown; addressNotes?: string | null; source?: string | null } | null
  items: Array<{ id: string; name: string; sku?: string | null; quantity: number }>
  scheduledDeliveryDate?: string | null
  deliveryWindow?: string | null
  assignment?: { id: string; driverId: string; warehouseAssignmentId?: string | null; status: string; assignedAt?: string; pickedUpAt?: string | null; deliveredAt?: string | null; failedAt?: string | null; failureReason?: string | null; notes?: string | null } | null
  route?: { id: string; routeNumber?: string | null; scheduledDate?: string; stopId?: string; sequenceNumber?: number } | null
  notes?: string | null
  failureReason?: string | null
  podAvailable: boolean
}export interface SupplierDeliveryBoard {
  orders: DriverDeliveryOrder[]
}

export interface DeliveryRouteStop {
  id: string
  routeId: string
  orderId: string
  sequenceNumber: number
  status: string
  restaurantName: string
  deliveryArea?: string | null
  itemCount?: number
  isNext?: boolean
}

export interface DeliveryRouteDetail {
  id: string
  routeNumber: string
  routeLabel: string
  status: string
  scheduledDate?: string
  stops: DeliveryRouteStop[]
}

export interface ProductsResponse {
  products: Product[]
  pagination?: { total: number | null; limit: number; offset: number | null; nextCursor?: string | null }
}

export interface OrdersResponse {
  orders: Order[]
  pagination?: { total: number; limit: number; offset: number }
}

export interface SuppliersResponse {
  suppliers: Supplier[]
}

export interface RestaurantsResponse {
  restaurants: Restaurant[]
}

/** Mirrors mapDeliveryLocationRow() in apps/api/src/lib/delivery-coordinates.js */
export interface DeliveryLocation {
  id: string
  name: string | null
  code?: string | null
  deliveryLatitude: number | null
  deliveryLongitude: number | null
  deliveryLocationLabel: string | null
  deliveryAddressNotes: string | null
  coordinatesAvailable: boolean
}

/** GET /api/restaurants/me/delivery-locations */
export interface DeliveryLocationsResponse {
  restaurant: DeliveryLocation | null
  branches: DeliveryLocation[]
}

/** PATCH /api/restaurants/me/delivery-location */
export interface DeliveryLocationUpdate {
  deliveryLatitude: number | null
  deliveryLongitude: number | null
  deliveryLocationLabel?: string | null
  deliveryAddressNotes?: string | null
}
