// Admin Dashboard types
import type { Product } from './products'

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

export interface PublicSupplier {
  id: string
  slug: string
  name: string
  logoUrl?: string | null
  brandDisplayName?: string | null
  brandPrimary?: string | null
  brandAccent?: string | null
  minimumOrderAmount?: number | null
  paymentTerms?: string | null
  publicCatalogEnabled?: boolean
  productCount?: number
}

export interface PublicSupplierProduct {
  id: string
  name: string
  sku: string
  category?: string | null
  unit?: string | null
  imageUrl?: string | null
  description?: string | null
  inStock?: boolean
  currentPrice?: number | null
  currency?: string
  pricingSource?: string | null
}

export interface PublicSupplierProductsResponse {
  products: PublicSupplierProduct[]
  categories: string[]
  pagination: { page: number; limit: number; total: number }
}

export interface QuoteRequestSummary {
  id: string
  restaurantId: string
  status: 'open' | 'closed' | 'cancelled'
  note?: string | null
  neededBy?: string | null
  createdAt: string
  updatedAt?: string
  itemCount?: number
  supplierCount?: number
  responseCount?: number
}

export interface QuoteRequestItem {
  id: string
  productId: string
  productName: string
  productSku: string
  productUnit?: string
  productImageUrl?: string | null
  productSupplierId?: string
  quantity: number
  unit?: string | null
  notes?: string | null
}

export interface QuoteResponseItem {
  id?: string
  quoteRequestItemId: string
  isAvailable: boolean
  unitPrice?: number | null
  currency?: string
  quantity?: number | null
  deliveryDate?: string | null
  note?: string | null
  substituteProductId?: string | null
  substituteProductName?: string | null
  substituteProductSku?: string | null
}

export interface QuoteRequestSupplierEntry {
  id: string
  supplierId: string
  supplierName: string
  supplierSlug?: string
  status: 'pending' | 'responded' | 'declined'
  response?: {
    id: string
    note?: string | null
    submittedAt?: string
    items: QuoteResponseItem[]
  } | null
}

export interface QuoteRequestDetail {
  quoteRequest: QuoteRequestSummary
  items: QuoteRequestItem[]
  suppliers: QuoteRequestSupplierEntry[]
}

export interface SupplierQuoteInboxEntry {
  id: string
  quoteRequestId: string
  status: 'pending' | 'responded' | 'declined'
  quoteRequestStatus: string
  note?: string | null
  neededBy?: string | null
  createdAt: string
  restaurantName: string
  itemCount: number
}

export interface SupplierQuoteRequestDetail {
  id: string
  quoteRequestId: string
  status: string
  restaurantId: string
  restaurantName: string
  quoteRequestNote?: string | null
  neededBy?: string | null
  items: QuoteRequestItem[]
  response?: {
    id: string
    note?: string | null
    submittedAt?: string
    items: QuoteResponseItem[]
  } | null
}

export interface QuoteCartPayload {
  supplierId: string
  items: Array<{
    productId: string
    quantity: number
    quotedUnitPrice?: number | null
    product: Product
  }>
  disclaimer: string
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
  teammates?: Array<{ id: string; displayName: string }>
  session?: {
    token: string
    expiresAt: string
  }
}
