// User types
export interface User {
  id: string
  email: string
  displayName: string
  role: 'ADMIN' | 'SUPPLIER' | 'RESTAURANT' | 'PENDING' | 'STAFF_PORTAL'
  /** platform = main app; staff_portal = operational staff only */
  accessType?: 'platform' | 'staff_portal'
  staffPortal?: {
    staffId: string
    restaurantId: string
    displayName?: string | null
  } | null
  createdAt: string
  /** Tenant-scoped role codes (e.g. RESTAURANT_OWNER, SUPPLIER_STAFF) */
  tenantRoles?: string[]
  /** Tenant-scoped permission codes for RBAC nav gating */
  tenantPermissions?: string[]
  /** Active workspace (supplier/restaurant account + role label) */
  workspace?: {
    tenantId: string
    tenantType: 'SUPPLIER' | 'RESTAURANT'
    tenantName: string
    roleName: string | null
  }
  /** Admin role codes when user.role === 'ADMIN' */
  adminRoles?: string[]
  /** Admin permission codes for admin nav gating */
  adminPermissions?: string[]
}

export interface UserWithDetails extends User {
  supplier?: Supplier
  restaurant?: Restaurant
}

// Product types
export interface Product {
  id: string
  supplier_id: string
  sku: string
  name: string
  name_ar?: string
  description?: string
  description_ar?: string
  brand?: string
  category?: string
  image_url?: string
  unit?: string
  created_at: string
  updated_at: string
  supplier_name?: string
  supplier_slug?: string
  available_qty?: number
  current_price?: number
  currency?: string
  /** Catalog list price before contract override */
  catalog_price?: number
  pricing_source?: 'DEFAULT_PRICE' | 'CONTRACT_PRICE'
  contract_price_id?: string | null
  contract_discount_percent?: number | null
  contract_valid_from?: string | null
  contract_valid_until?: string | null
  contract_min_order_quantity?: number | null
}

export interface CreateProductRequest {
  sku: string
  name: string
  name_ar?: string
  description?: string
  description_ar?: string
  brand?: string
  category?: string
  image_url?: string
  unit?: string
  supplier_id?: string
  warehouse_id?: string
  price?: number
  initialStock?: number
}

export interface UpdateProductRequest {
  sku?: string
  name?: string
  name_ar?: string
  description?: string
  description_ar?: string
  brand?: string
  category?: string
  image_url?: string
  unit?: string
}

export interface ProductFilters {
  q?: string
  category?: string
  supplier?: string
  inStock?: boolean
  includeStock?: boolean
  limit?: number
  offset?: number
}

export interface ProductsResponse {
  products: Product[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

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
  q?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
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

// Supplier types
export interface Supplier {
  id: string
  name: string
  slug: string
  vat_no?: string
  contact_email: string
  phone?: string
  address_json?: Address
  created_at: string
  updated_at: string
}

export interface CreateSupplierRequest {
  name: string
  slug: string
  vatNo?: string
  contactEmail: string
  phone?: string
  address?: Address
}

export interface UpdateSupplierRequest {
  name?: string
  slug?: string
  vatNo?: string
  contactEmail?: string
  phone?: string
  address?: Address
}

export interface SupplierFilters {
  q?: string
  city?: string
  limit?: number
  offset?: number
}

export interface SuppliersResponse {
  suppliers: Supplier[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

// Restaurant types
export interface Restaurant {
  id: string
  name: string
  slug: string
  trade_license_no?: string
  contact_email: string
  phone?: string
  address_json?: Address
  created_at: string
  updated_at: string
}

export interface CreateRestaurantRequest {
  name: string
  slug: string
  tradeLicenseNo?: string
  contactEmail: string
  phone?: string
  address?: Address
}

export interface UpdateRestaurantRequest {
  name?: string
  slug?: string
  tradeLicenseNo?: string
  contactEmail?: string
  phone?: string
  address?: Address
}

export interface RestaurantFilters {
  q?: string
  city?: string
  limit?: number
  offset?: number
}

export interface RestaurantsResponse {
  restaurants: Restaurant[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

// Price types
export interface Price {
  id: string
  product_id: string
  currency: string
  amount: number
  min_qty: number
  valid_from: string
  valid_to?: string
  product_name?: string
  sku?: string
}

export interface CreatePriceRequest {
  productId: string
  currency: string
  amount: number
  minQty?: number
  validFrom?: string
  validTo?: string
}

export interface UpdatePriceRequest {
  currency?: string
  amount?: number
  minQty?: number
  validFrom?: string
  validTo?: string
}

// Inventory types
export interface Inventory {
  product_id: string
  available_qty: number
  updated_at: string
  product_name?: string
  sku?: string
  supplier_name?: string
}

export interface UpdateInventoryRequest {
  availableQty: number
}

// File types
export interface PresignedUrlRequest {
  fileName: string
  fileType: string
  fileSize?: number
}

export interface PresignedUrlResponse {
  presignedUrl: string
  fileKey: string
  fileName: string
  fileType: string
}

export interface AttachFileRequest {
  fileKey: string
  fileName: string
  fileType?: string
}

export interface Attachment {
  id: string
  owner_type: string
  owner_id: string
  url: string
  type?: string
  meta?: Record<string, any>
}

// Dashboard types
export interface DashboardStats {
  totalSuppliers?: number
  totalRestaurants?: number
  totalProducts?: number
  totalOrders?: number
  pendingOrders?: number
  completedOrders?: number
  totalRevenue?: number
  totalSpent?: number
}

// Audit types
export interface AuditLog {
  id: string
  actor_sub?: string
  actor_role?: string
  ip?: string
  action: string
  resource?: string
  resource_id?: string
  payload?: Record<string, any>
  status: number
  request_id?: string
  created_at: string
}

export interface AuditLogFilters {
  actor?: string
  action?: string
  resource?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export interface AuditLogsResponse {
  logs: AuditLog[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

// Common types
export interface Address {
  street?: string
  city?: string
  region?: string
  country?: string
}

export interface ApiResponse<T> {
  ok: boolean
  data: T | null
  error: {
    name: string
    message: string
    details?: any
  } | null
  requestId: string
}

// Cart types
export interface CartItem {
  productId: string
  product: Product
  quantity: number
  notes?: string
}

export interface CartGroup {
  supplierId: string
  supplierName: string
  items: CartItem[]
  subtotal: number
}

// Reorder Suggestion types
export interface ReorderSuggestion {
  id: string
  restaurant_id: string
  product_id: string
  current_qty: number
  low_stock_threshold?: number
  branch_id?: string
  product_name: string
  product_sku: string
  product_unit?: string
  supplier_name: string
  supplier_id: string
  lead_time_days?: number
  moq?: number
  order_multiple?: number
  branch_name?: string
  usage_1day: number
  usage_3day: number
  usage_7day: number
  usage_10day: number
  usage_30day: number
  usage_60day: number
  usage_90day: number
  avg_daily_usage_30day: number
  avg_days_between_restocks: number
  last_order_qty: number
  days_since_last_restock: number
  restock_count_90day: number
  usage_trend: number
  last_order_item_qty: number
  days_of_stock_remaining?: number
  suggested_reorder_qty?: number
  urgency_level: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  confidence_score: number
}

export interface ReorderSuggestionsResponse {
  suggestions: ReorderSuggestion[]
}

// Reservations types
export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'WAITLIST'

export type ReservationTableShape = 'round' | 'square' | 'rectangle' | 'booth' | 'chef_table'
export type ReservationTableZone = 'main' | 'patio' | 'bar' | 'vip' | 'private'

export interface ReservationTableLayout {
  shape?: ReservationTableShape
  color?: string
  zone?: ReservationTableZone
  features?: string[]
  notes?: string
  rotation?: number
  width?: number
  height?: number
  widthRatio?: number
  heightRatio?: number
  [key: string]: unknown
}

export interface ReservationTable {
  id: string
  restaurant_id: string
  branch_id?: string | null
  name: string
  capacity: number
  layout?: ReservationTableLayout
  position?: { x?: number; y?: number }
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Reservation {
  id: string
  restaurant_id: string
  branch_id?: string | null
  tables: string[]
  status: ReservationStatus
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  party_size: number
  scheduled_at: string
  duration_minutes: number
  notes?: string | null
  metadata?: Record<string, unknown>
  waitlist: boolean
  auto_confirmed: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface ReservationWaitlist {
  id: string
  restaurant_id: string
  branch_id?: string | null
  customer_name: string
  customer_phone?: string | null
  party_size: number
  requested_at: string
  preferred_time?: string | null
  notes?: string | null
  status: 'WAITING' | 'NOTIFIED' | 'SEATED' | 'CANCELLED'
  metadata?: Record<string, unknown>
}

export interface ReservationBoardResponse {
  day: string
  tables: ReservationTable[]
  reservations: Reservation[]
  waitlist: ReservationWaitlist[]
}

export interface ReservationAnalyticsResponse {
  periodStart: string
  slots: Array<{
    hour_slot: string
    confirmed: number
    cancelled: number
    waitlisted: number
    total_covers: number
  }>
  waitlist: Array<{ status: string; total: number }>
}

// Staff App types
export type StaffStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
export type StaffWageType = 'HOURLY' | 'SALARY' | 'CONTRACT' | 'OTHER'

export interface StaffPortalAccessInfo {
  hasAccount: boolean
  enabled: boolean
  status: 'none' | 'invited' | 'active' | 'disabled'
  invitedAt?: string | null
  lastLoginAt?: string | null
  disabledAt?: string | null
}

export interface StaffMember {
  id: string
  restaurantId: string
  status: StaffStatus
  firstName: string
  lastName: string
  displayName: string
  email?: string | null
  phone?: string | null
  role: string
  wageType: StaffWageType
  wageRate?: number | null
  hireDate?: string | null
  profileColor?: string | null
  portalAccess?: StaffPortalAccessInfo
  createdAt: string
  updatedAt: string
}

export type StaffShiftStatus = 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED'

export interface StaffShift {
  id: string
  restaurantId: string
  staffId?: string | null
  role: string
  shiftDate: string
  startsAt: string
  endsAt: string
  status: StaffShiftStatus
  notes?: string | null
  staff?: {
    id: string
    name: string
    role: string
  } | null
  createdAt: string
  updatedAt: string
}

export type StaffTimeEntryStatus = 'OPEN' | 'APPROVED' | 'LOCKED' | 'ADJUSTMENT_REQUIRED'

export interface StaffTimeEntry {
  id: string
  restaurantId: string
  staffId: string
  shiftId?: string | null
  clockInAt: string
  clockInMethod?: string | null
  clockOutAt?: string | null
  clockOutMethod?: string | null
  breakMinutes: number
  breakDetails?: Record<string, unknown> | null
  status: StaffTimeEntryStatus
  note?: string | null
  staffName?: string | null
  role?: string | null
  createdAt: string
  updatedAt: string
}

export type StaffPtoType = 'VACATION' | 'SICK' | 'PERSONAL' | 'UNPAID' | 'OTHER'
export type StaffPtoStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED'

export interface StaffPtoRequest {
  id: string
  restaurantId: string
  staffId: string
  type: StaffPtoType
  status: StaffPtoStatus
  startDate: string
  endDate: string
  hoursRequested?: number | null
  reason?: string | null
  managerNote?: string | null
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  staff?: {
    id: string
    name: string
    role: string
  } | null
}

export interface StaffAvailability {
  id: string
  restaurantId: string
  staffId: string
  weekday: number
  availability: {
    blocks: Array<{ start: string; end: string }>
  }
  notes?: string | null
  staffName?: string | null
  createdAt: string
  updatedAt: string
}

export type StaffSwapStatus = 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED'

export interface StaffShiftSwap {
  id: string
  restaurantId: string
  shiftId: string
  requestedBy: string
  proposedCoverId?: string | null
  status: StaffSwapStatus
  reason?: string | null
  managerNote?: string | null
  createdAt: string
  updatedAt: string
  shift?: {
    id: string
    role: string
    startsAt: string
    endsAt: string
    date: string
  } | null
  requester?: {
    id: string
    name: string
  } | null
  cover?: {
    id: string
    name: string
  } | null
}

export interface StaffAnnouncement {
  id: string
  restaurantId: string
  title: string
  body: string
  audience?: Record<string, unknown> | null
  requireAck: boolean
  publishedAt: string
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  acknowledgmentCount: number
  acknowledged: boolean
}

export interface StaffDocument {
  id: string
  restaurantId: string
  staffId: string
  docType: string
  title?: string | null
  fileUrl: string
  fileSize?: number | null
  uploadedAt: string
  expiresAt?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  staff?: {
    id: string
    name: string
  } | null
}

export type StaffIncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface StaffIncident {
  id: string
  restaurantId: string
  staffId?: string | null
  category: string
  severity: StaffIncidentSeverity
  occurredAt: string
  notes?: string | null
  followUpAction?: string | null
  attachments?: Record<string, unknown> | null
  staff?: {
    id: string
    name: string
  } | null
  createdAt: string
  updatedAt: string
}

export type StaffPerformanceNoteType = 'COACHING' | 'KUDOS' | 'GENERAL'

export interface StaffPerformanceNote {
  id: string
  restaurantId: string
  staffId: string
  noteType: StaffPerformanceNoteType
  body: string
  createdBy?: string | null
  staff?: {
    id: string
    name: string
  } | null
  createdAt: string
}

export type StaffPayrollStatus = 'DRAFT' | 'APPROVED' | 'EXPORTED'

export interface StaffPayrollExport {
  id: string
  restaurantId: string
  periodStart: string
  periodEnd: string
  status: StaffPayrollStatus
  totals?: Record<string, unknown> | null
  exportUrl?: string | null
  exportedAt?: string | null
  exportedBy?: string | null
  createdAt: string
  updatedAt: string
}

// Admin Dashboard types
export interface SubscriptionPlan {
  id: string
  code: string // free, silver, gold, platinum
  name: string
  description?: string
  price_per_month: number
  price_per_year?: number
  type: 'restaurant_only' | 'supplier_only' | 'restaurant_and_supplier'
  tenant_type: 'RESTAURANT' | 'SUPPLIER'
  limits: Record<string, any> // JSONB object with limit keys
  features: Record<string, any> // JSONB object with feature capabilities
  trial_days: number
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  tenant_id: string
  tenant_type: 'SUPPLIER' | 'RESTAURANT'
  plan_id: string
  plan_name: string
  status: 'TRIALING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'PAST_DUE'
  trial_ends_at?: string
  current_period_start?: string
  current_period_end?: string
  billing_cycle?: 'MONTHLY' | 'YEARLY'
  next_billing_date?: string
  cancelled_at?: string
  cancel_reason?: string
  created_at: string
  updated_at: string
  tenant_name?: string
  tenant_email?: string
  price_per_month?: number
  price_per_year?: number
  plan_limits?: Record<string, any>
  plan_features?: string[]
}

export interface LocationLimitSummary {
  included: number | null
  addonQuantity: number
  effective: number | null
  current: number
  overIncludedLimit?: boolean
  overEffectiveLimit?: boolean
  enterpriseThreshold?: number
  atEnterpriseThreshold?: boolean
}

export interface SubscriptionAddonEntitlement {
  id: string
  key: string
  quantity: number
  unitPriceMonthly: number | null
  status: string
  startsAt: string | null
  endsAt: string | null
}

export interface Entitlements {
  tenantType: 'RESTAURANT' | 'SUPPLIER'
  tenantId: string
  billingTenantId?: string
  usesOrgBilling?: boolean
  plan: {
    id: string
    name: string
    code: string
    tenant_type: string
    price_monthly: number | null
    price_yearly: number | null
  }
  features: Record<string, boolean | string>
  /** Raw plan catalog feature JSON (tier strings); use with isEntitlementFeatureEnabled when features is incomplete. */
  planFeatures?: Record<string, unknown>
  /** How each feature in `features` was resolved (tenant override → global → plan → default). */
  featureSources?: Record<string, 'tenant_override' | 'global' | 'plan' | 'default'>
  limits: Record<string, number | null>
  baseLimits: Record<string, number | null>
  limitsBeforeAddons?: Record<string, number | null>
  addons?: SubscriptionAddonEntitlement[]
  locationLimits?: {
    branches?: LocationLimitSummary
    warehouses?: LocationLimitSummary
  }
  overrides: Array<{
    limitKey: string
    value: number
    reason: string | null
    expiresAt: string | null
    scope?: string
  }>
  usage: Record<string, number>
  usageWindowMeta?: Record<string, { date?: string }>
  freeSandbox?: { expiresAt: string | null } | null
}

export interface AdminFeatureFlag {
  featureKey: string
  featureName: string
  description: string | null
  globalOverride: boolean | null
  updatedAt: string | null
}

export interface EffectiveFeature {
  featureKey: string
  featureName: string
  enabled: boolean
  source: 'tenant_override' | 'global' | 'plan' | 'default'
  planValue: unknown
  tenantOverride: { enabled: boolean; reason: string | null } | null
}

export interface BillingPaymentMethod {
  id: string
  provider: string
  type: 'CARD' | 'BANK_ACCOUNT' | 'WALLET' | 'MANUAL'
  brand?: string | null
  last4?: string | null
  exp_month?: number | null
  exp_year?: number | null
  bank_name?: string | null
  is_default: boolean
  status: string
  created_at: string
}

export interface BillingInvoice {
  id: string
  invoice_number: string
  amount: number
  currency: string
  status: string
  due_date: string
  billing_cycle?: string
  plan_name?: string
}

export interface BillingAccessState {
  requiresPayment: boolean
  isPastDue: boolean
  inGracePeriod: boolean
  isLocked: boolean
  pendingActivation?: boolean
  daysUntilLock: number | null
  gracePeriodEndsAt: string | null
  pastDueSince: string | null
  lockReason: string | null
  autoRenew: boolean
}

export interface BillingStatus {
  subscription: {
    id: string
    status: string
    planId: string
    planName: string
    planCode: string
    billingCycle?: string
    nextBillingDate?: string
    currentPeriodEnd?: string
    autoRenew: boolean
  } | null
  access: BillingAccessState
  paymentMethods: BillingPaymentMethod[]
  defaultPaymentMethod: BillingPaymentMethod | null
  openInvoices: BillingInvoice[]
  amountDue: number
  gracePeriodDays: number
  availableGateways?: string[]
  gateways?: string[]
}

/** Plan recommendation from GET /api/subscriptions/recommendation */
export interface PlanRecommendation {
  recommendedPlanCode: string
  recommendedPlanName?: string
  reasonCode?: string
  reasonText?: string
  reason?: string
  evidence?: {
    tenantType: string
    currentPlanCode: string
    triggeredBy?: { type: string; key: string }
    usage?: { key: string; value: number; limit: number; pct: number }
    blocked?: { limitKeys: string[]; featureKeys: string[] }
  }
  comparedToCurrent: {
    resolvesLimits: Array<{
      limitKey: string
      currentUsage?: number
      currentLimit?: number | null
      newLimit?: number | null
    }>
    unlocksFeatures?: string[]
    upgrades?: string[]
  }
}

/** Response from POST /api/admin-dashboard/subscriptions/:id/preview-change */
export interface SubscriptionPlanChangePreview {
  willExceed: Array<{ limitKey: string; usage: number; limit: number }>
  featureDiff: { enabled: string[]; disabled: string[] }
  recommendedActions: string[]
}

export interface UsageMeter {
  id: string
  tenant_id: string
  tenant_type: 'SUPPLIER' | 'RESTAURANT'
  meter_type: string
  current_value: number
  period_type: 'DAILY' | 'MONTHLY' | 'Billing Cycle'
  period_start_date?: string
  period_end_date?: string
  limit_value?: number
  is_over_limit: boolean
  last_updated: string
  created_at: string
}

export interface PublicRestaurant {
  id: string
  name: string
  contact_email?: string | null
  created_at?: string
}

export interface PublicAvailabilitySlot {
  startTime: string
  endTime: string
  capacityAvailable: number
  seatsLeft?: number
  isAvailable: boolean
  status?: 'available' | 'limited' | 'full' | 'past'
}

export interface PublicAvailabilityResponse {
  slots: PublicAvailabilitySlot[]
  totalCapacity?: number
  tableCount?: number
  bookingWindow?: {
    closed?: boolean
    source?: string
    openTime?: string
    closeTime?: string
  } | null
}

export interface PublicReservationSummary {
  id: string
  restaurantId: string
  scheduledAt: string
  partySize: number
  status: string
  manageToken: string
  manageUrl: string
}

export interface PublicReservationDetails {
  id: string
  restaurant_id: string
  tables: string[]
  status: string
  customer_name: string
  customer_phone?: string | null
  party_size: number
  scheduled_at: string
  duration_minutes: number
  notes?: string | null
  waitlist: boolean
  auto_confirmed: boolean
  public_token: string
}

export interface StaffPortalSession {
  sessionToken: string
  expiresAt: string
  staffId: string
  restaurantId: string
  staffName: string
}

export interface StaffPortalDashboard {
  staff: {
    id: string
    display_name: string
    role: string
    email?: string | null
    phone?: string | null
  }
  upcomingShifts: Array<{
    id: string
    role: string
    shift_date: string
    starts_at: string
    ends_at: string
    status: string
  }>
  ptoRequests: Array<{
    id: string
    type: string
    status: string
    start_date: string
    end_date: string
    hours_requested?: number | null
    created_at: string
  }>
  swapRequests: Array<{
    id: string
    status: string
    reason?: string | null
    created_at: string
  }>
  announcements: Array<{
    id: string
    title: string
    body: string
    require_ack: boolean
    published_at: string
    acknowledged: boolean
  }>
  documents: Array<{
    id: string
    doc_type: string
    title?: string | null
    file_url: string
    status?: string | null
    uploaded_at: string
    expires_at?: string | null
  }>
  session: {
    token: string
    expiresAt: string
  }
}
