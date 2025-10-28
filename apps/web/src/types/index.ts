// User types
export interface User {
  id: string
  email: string
  displayName: string
  role: 'ADMIN' | 'SUPPLIER' | 'RESTAURANT'
  createdAt: string
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
  status?: 'DRAFT' | 'PLACED' | 'ACKNOWLEDGED' | 'PROCESSING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'
  notes?: string
}

export interface OrderFilters {
  status?: string
  supplier?: string
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

// Admin Dashboard types
export interface SubscriptionPlan {
  id: string
  name: string
  description?: string
  price_per_month: number
  price_per_year?: number
  limits: Record<string, any>
  features: string[]
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

export interface FeatureFlag {
  id: string
  feature_key: string
  feature_name: string
  description?: string
  is_enabled_globally: boolean
  created_at: string
  updated_at: string
}

export interface FeatureFlagOverride {
  id: string
  tenant_id: string
  tenant_type: 'SUPPLIER' | 'RESTAURANT'
  feature_flag_id: string
  feature_key: string
  is_enabled: boolean
  created_at: string
  updated_at: string
  feature_name?: string
  is_enabled_globally?: boolean
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