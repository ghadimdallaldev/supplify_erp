import { api } from '../base'
import type { LegalAcceptancePayload } from '../../../lib/legalDocuments'
import type {
  User,
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  ProductFilters,
  ProductsResponse,
  Order,
  CreateOrderRequest,
  CreateManualOrderRequest,
  UpdateOrderRequest,
  OrderFilters,
  OrdersResponse,
  Supplier,
  SupplierFilters,
  SuppliersResponse,
  Restaurant,
  RestaurantFilters,
  RestaurantsResponse,
  Price,
  CreatePriceRequest,
  Inventory,
  UpdateInventoryRequest,
  AuditLogFilters,
  AuditLogsResponse,
  PresignedUrlRequest,
  PresignedUrlResponse,
  AttachFileRequest,
  Attachment,
  ReorderSuggestionsResponse,
  ReorderAssistanceItem,
  SubscriptionPlan,
  Subscription,
  Entitlements,
  AdminFeatureFlag,
  EffectiveFeature,
  SubscriptionPlanChangePreview,
  BillingStatus,
  BillingPaymentMethod,
  UsageMeter,
  PublicRestaurant,
  PublicSupplier,
  PublicSupplierProductsResponse,
  QuoteRequestSummary,
  QuoteRequestDetail,
  SupplierQuoteInboxEntry,
  SupplierQuoteRequestDetail,
  QuoteCartPayload,
  PublicAvailabilityResponse,
  PublicReservationSummary,
  StaffPortalSession,
  StaffPortalDashboard,
  StaffPtoRequest,
  StaffShiftSwap,
  StaffTimeEntry,
  PublicReservationDetails,
  DispatchOrderCard,
  DeliveryRouteSummary,
  DeliveryRouteDetail,
  OrderTrackingResponse,
  AdminUserPreferences,
} from '../../../types'
import {
  normalizeAdminPlanUpdateResult,
  type AdminPlanUpdateResult,
} from '../../../lib/adminPlanSaveFeedback'
import { normalizeListResponse } from '../../../lib/apiError'
import {
  normalizeContractPricingList,
  normalizeContractPricingRecord,
  normalizeMyContractPricing,
  normalizeResolvedContractPrices,
} from '../../../lib/contractPricingResponse'
import { normalizeReportResponse } from '../../../lib/reportResponse'
import { resolveUpgradeUrl } from '../../../lib/externallyControlledFeatures'

export const adminApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getAdminOverview: builder.query<import('../../../lib/adminOverview').AdminOverview, void>({
      query: () => '/api/admin-dashboard/overview',
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    getAdminPlatformSettings: builder.query<{ freeSandboxDays: number }, void>({
      query: () => '/api/admin-dashboard/platform-settings',
      providesTags: ['Admin'],
    }),
    updateAdminPlatformSettings: builder.mutation<
      { freeSandboxDays: number },
      { freeSandboxDays: number }
    >({
      query: (body) => ({
        url: '/api/admin-dashboard/platform-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    getAdminConversionStats: builder.query<
      {
        days: number
        totalBlocks: number
        totalUpgrades: number
        blocksToUpgradesConversionPercent: number
        mostBlockedFeature: string | null
        mostBlockedLimit: string | null
        blocksByFeature: Array<{ key: string; count: number }>
        blocksByLimit: Array<{ key: string; count: number }>
        countsPerEventType?: { '7d': Record<string, number>; '30d': Record<string, number> }
        funnelDropOff?: {
          '7d': {
            blocked: number
            openUpgrade: number
            clickUpgrade: number
            upgradeSuccess: number
          }
          '30d': {
            blocked: number
            openUpgrade: number
            clickUpgrade: number
            upgradeSuccess: number
          }
        }
        recommendationFunnel?: {
          '7d': { shown: number; clicked: number; upgradeSuccess: number }
          '30d': { shown: number; clicked: number; upgradeSuccess: number }
        }
      },
      { days?: number }
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/conversion-stats',
        params: params ?? {},
      }),
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    getAdminPlans: builder.query<
      { plans: SubscriptionPlan[] },
      { tenant_type?: 'RESTAURANT' | 'SUPPLIER' }
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/plans',
        params: params ?? {},
      }),
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    createAdminPlan: builder.mutation<SubscriptionPlan, any>({
      query: (body) => ({
        url: '/api/admin-dashboard/plans',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    updateAdminPlan: builder.mutation<
      AdminPlanUpdateResult,
      { id: string; data: Record<string, unknown> }
    >({
      query: ({ id, data }) => ({
        url: `/api/admin-dashboard/plans/${id}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (raw) =>
        normalizeAdminPlanUpdateResult(
          raw as AdminPlanUpdateResult | import('../../../types').SubscriptionPlan
        ),
      invalidatesTags: ['Admin'],
    }),
    getAdminSubscriptions: builder.query<{ subscriptions: Subscription[] }, any>({
      query: (params) => ({
        url: '/api/admin-dashboard/subscriptions',
        params,
      }),
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    updateAdminSubscription: builder.mutation<
      {
        subscription: Subscription
        appliedViaOrgBilling?: boolean
        billingTenantId?: string
      },
      { id: string; data: any }
    >({
      query: ({ id, data }) => ({
        url: `/api/admin-dashboard/subscriptions/${id}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (raw: {
        subscription?: Subscription
        appliedViaOrgBilling?: boolean
        billingTenantId?: string
      }) =>
        raw?.subscription
          ? {
              subscription: raw.subscription,
              appliedViaOrgBilling: raw.appliedViaOrgBilling,
              billingTenantId: raw.billingTenantId,
            }
          : { subscription: raw as unknown as Subscription },
      invalidatesTags: ['Admin'],
    }),
    previewSubscriptionPlanChange: builder.mutation<
      SubscriptionPlanChangePreview,
      { subscriptionId: string; targetPlanId: string }
    >({
      query: ({ subscriptionId, targetPlanId }) => ({
        url: `/api/admin-dashboard/subscriptions/${subscriptionId}/preview-change`,
        method: 'POST',
        body: { targetPlanId },
      }),
      invalidatesTags: ['Admin'],
    }),
    getTenantUsage: builder.query<
      { usage: UsageMeter[]; period: string },
      { tenantId: string; tenantType: string; period?: string }
    >({
      query: ({ tenantId, tenantType, period }) => ({
        url: `/api/admin-dashboard/usage/${tenantId}`,
        params: { tenantType, period },
      }),
      providesTags: ['Admin'],
    }),
    getAdminAuditLogs: builder.query<
      { logs: any[]; total: number; limit: number; offset: number; actionTypes: string[] },
      {
        limit?: number
        offset?: number
        tenantId?: string
        actionType?: string
        adminId?: string
        dateFrom?: string
        dateTo?: string
        search?: string
      }
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/audit-logs',
        params,
      }),
      providesTags: ['Admin'],
    }),
    getAdminActivity: builder.query<
      { events: any[]; total: number; limit: number; offset: number },
      { limit?: number; offset?: number; type?: string }
    >({
      query: (params) => ({ url: '/api/admin-dashboard/activity', params }),
      providesTags: ['Admin'],
    }),
    getAdminHealth: builder.query<
      {
        jobFailures: any[] | null
        webhookFailures: any[] | null
        emailFailures: Array<{
          id: string
          tenantId?: string
          eventType: string
          status: string
          recipientRedacted: string
          errorMessage?: string
          createdAt: string
        }> | null
        recentApiErrors: any[]
        dbPool: { total: number; idle: number; waiting: number } | null
      },
      void
    >({
      query: () => '/api/admin-dashboard/health',
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    getAdminOperationalSummary: builder.query<{ summary: Record<string, unknown> }, void>({
      query: () => '/api/admin-dashboard/operational-summary',
      providesTags: ['Admin'],
    }),
    getAdminEmailDeliveryLogs: builder.query<
      { logs: any[]; total: number; limit: number; offset: number },
      {
        limit?: number
        offset?: number
        tenantId?: string
        status?: string
        eventType?: string
        since?: string
      }
    >({
      query: (params) => ({ url: '/api/admin-dashboard/operational/email-logs', params }),
      providesTags: ['Admin'],
    }),
    getAdminFulfillmentIssues: builder.query<
      { issues: any[]; total: number; limit: number; offset: number },
      { limit?: number; offset?: number; supplierId?: string; restaurantId?: string }
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/operational/fulfillment-issues',
        params,
      }),
      providesTags: ['Admin'],
    }),
    getAdminActiveDeliveries: builder.query<{ deliveries: any[] }, { limit?: number } | void>({
      query: (params) => ({
        url: '/api/admin-dashboard/operational/active-deliveries',
        params: params ?? {},
      }),
      providesTags: ['Admin'],
    }),
    getAdminTenantOperationalSnapshot: builder.query<
      { snapshot: Record<string, unknown> },
      { tenantType: 'RESTAURANT' | 'SUPPLIER'; tenantId: string }
    >({
      query: ({ tenantType, tenantId }) =>
        `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/operational-snapshot`,
      providesTags: ['Admin'],
    }),
    getAdminTenantEntitlements: builder.query<
      { entitlements: Record<string, unknown>; effectiveFeatures: Record<string, unknown> },
      { tenantType: 'RESTAURANT' | 'SUPPLIER'; tenantId: string }
    >({
      query: ({ tenantType, tenantId }) =>
        `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/entitlements`,
      providesTags: ['Admin'],
    }),
    getAdminFinancialOverview: builder.query<
      {
        gmv: number
        outstanding: number
        overdue: number
        revenueByPlan: any[]
        mrr: number
        arr: number
        topTenantsByRevenue: any[]
        topTenantsByOverdue: any[]
      },
      void
    >({
      query: () => '/api/admin-dashboard/financial-overview',
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    getAdminSuppliers: builder.query<
      { suppliers: any[]; total?: number; limit?: number; offset?: number },
      { limit?: number; offset?: number } | void
    >({
      query: (args) => {
        const limit = args?.limit ?? 100
        const offset = args?.offset ?? 0
        return `/api/admin-dashboard/tenants/suppliers?limit=${limit}&offset=${offset}`
      },
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    getAdminRestaurants: builder.query<
      { restaurants: any[]; total?: number; limit?: number; offset?: number },
      { limit?: number; offset?: number } | void
    >({
      query: (args) => {
        const limit = args?.limit ?? 100
        const offset = args?.offset ?? 0
        return `/api/admin-dashboard/tenants/restaurants?limit=${limit}&offset=${offset}`
      },
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    getAdminUsers: builder.query<
      {
        users: Array<{
          id: string
          email: string
          display_name: string | null
          role: string
          created_at: string
          tenant_roles: Array<{ tenantId?: string; tenantType?: string; roleName?: string }>
        }>
      },
      {
        search?: string
        q?: string
        tenantId?: string
        tenantType?: 'RESTAURANT' | 'SUPPLIER'
        limit?: number
      }
    >({
      query: (params) => ({ url: '/api/admin-dashboard/users', params }),
      providesTags: ['Admin'],
    }),
    resetAdminUserPassword: builder.mutation<
      {
        userId: string
        email: string
        displayName: string | null
        role: string
        temporaryPassword?: string
        temporary: boolean
      },
      {
        userId?: string
        email?: string
        password?: string
        temporary?: boolean
        generate?: boolean
      }
    >({
      query: (body) => ({
        url: '/api/admin-dashboard/users/reset-password',
        method: 'POST',
        body,
      }),
    }),
    getSupplierUsage: builder.query<{ usage: UsageMeter[] }, string>({
      query: (id) => `/api/admin-dashboard/tenants/suppliers/${id}/usage`,
      providesTags: ['Admin'],
    }),
    getRestaurantUsage: builder.query<{ usage: UsageMeter[] }, string>({
      query: (id) => `/api/admin-dashboard/tenants/restaurants/${id}/usage`,
      providesTags: ['Admin'],
    }),
  }),
})
