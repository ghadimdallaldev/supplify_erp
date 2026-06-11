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

export const financeApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getRestaurantInvoices: builder.query<any, any>({
      query: (params) => ({
        url: '/api/restaurant-finance/invoices',
        params,
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getRestaurantInvoice: builder.query<any, string>({
      query: (id) => `/api/restaurant-finance/invoices/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'RestaurantFinance', id }],
    }),
    // Enhanced payment with partial payment, credits, and HQ support
    markInvoicePaid: builder.mutation<any, { invoiceId: string; data: any }>({
      query: ({ invoiceId, data }) => ({
        url: `/api/restaurant-finance/invoices/${invoiceId}/pay`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { invoiceId }) => [
        { type: 'RestaurantFinance', id: invoiceId },
        'RestaurantFinance',
        'Order',
      ],
    }),
    recordSupplierPayment: builder.mutation<
      { payment: unknown },
      {
        invoice_id: string
        payment_amount: number
        payment_date: string
        payment_method: string
        payment_reference?: string
        bank_name?: string
        notes?: string
      }
    >({
      query: (body) => ({
        url: '/api/payments',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantFinance', 'Order'],
    }),
    getInvoiceCredits: builder.query<any, string>({
      query: (invoiceId) => `/api/restaurant-finance/invoices/${invoiceId}/credits`,
      providesTags: ['RestaurantFinance'],
    }),
    getInvoiceAnalytics: builder.query<any, { period?: number }>({
      query: ({ period = 30 }) => ({
        url: '/api/restaurant-finance/invoices/analytics',
        params: { period },
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getOrderInvoices: builder.query<any, string>({
      query: (orderId) => `/api/restaurant-finance/orders/${orderId}/invoices`,
      providesTags: (_result, _error, orderId) => [
        { type: 'Order', id: orderId },
        'RestaurantFinance',
      ],
    }),
    getSupplierStatement: builder.query<any, { supplierId: string; params?: any }>({
      query: ({ supplierId, params }) => ({
        url: `/api/restaurant-finance/suppliers/${supplierId}/statement`,
        params,
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getRestaurantExpenses: builder.query<any, any>({
      query: (params) => ({
        url: '/api/restaurant-finance/expenses',
        params,
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getOverdueInvoices: builder.query<any, void>({
      query: () => '/api/restaurant-finance/overdue',
      providesTags: ['RestaurantFinance'],
    }),

    // Supplier invoices
    getSupplierInvoices: builder.query<any, any>({
      query: (params) => ({ url: '/api/invoices', params }),
      providesTags: ['RestaurantFinance'],
    }),
    getSupplierReceivables: builder.query<any, void>({
      query: () => '/api/supplier/invoices/receivables',
      providesTags: ['SupplierOps', 'RestaurantFinance'],
    }),
    getSupplierCommandCenter: builder.query<any, void>({
      query: () => '/api/supplier/command-center',
      providesTags: ['SupplierOps', 'Order', 'Fulfillment', 'RestaurantFinance'],
    }),
    getSupplierReorderIntelligence: builder.query<any, { graceDays?: number } | void>({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg?.graceDays) params.set('grace_days', String(arg.graceDays))
        const qs = params.toString()
        return `/api/supplier/reorder-intelligence${qs ? `?${qs}` : ''}`
      },
      providesTags: ['SupplierOps'],
    }),
    getSupplierReorderAssistance: builder.query<any, { graceDays?: number } | void>({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg?.graceDays) params.set('grace_days', String(arg.graceDays))
        const qs = params.toString()
        return `/api/supplier/reorder-assistance${qs ? `?${qs}` : ''}`
      },
      providesTags: ['SupplierOps'],
    }),
    createReorderReminderDraft: builder.mutation<
      {
        draft: {
          id: string
          subject: string
          body: string
          status: string
          autoSent: boolean
          chatUrl?: string | null
          chatPrefill?: string
        }
      },
      { restaurantId: string; openChat?: boolean }
    >({
      query: ({ restaurantId, openChat }) => ({
        url: `/api/supplier/reorder-intelligence/${restaurantId}/reminder-draft`,
        method: 'POST',
        body: openChat ? { openChat: true } : undefined,
      }),
      invalidatesTags: ['SupplierOps'],
    }),
    getSupplierDeliveryBoard: builder.query<
      any,
      { date?: string; status?: string; driverId?: string; area?: string } | void
    >({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg?.date) params.set('date', arg.date)
        if (arg?.status) params.set('status', arg.status)
        if (arg?.driverId) params.set('driver_id', arg.driverId)
        if (arg?.area) params.set('area', arg.area)
        const qs = params.toString()
        return `/api/supplier/deliveries/board${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Fulfillment', 'SupplierOps'],
    }),
    previewProductImport: builder.mutation<
      any,
      { csv: string; columnMapping?: Record<string, string> }
    >({
      query: (body) => ({
        url: '/api/supplier/products/import/preview',
        method: 'POST',
        body,
      }),
    }),
    executeProductImport: builder.mutation<any, { csv: string; partial?: boolean }>({
      query: (body) => ({
        url: '/api/supplier/products/import',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product', 'Inventory'],
    }),
    getProductSubstitutes: builder.query<any, string>({
      query: (productId) => `/api/supplier/products/${productId}/substitutes`,
      providesTags: (_r, _e, id) => [{ type: 'Product', id }],
    }),
    createProductSubstitute: builder.mutation<
      any,
      { productId: string; substituteProductId: string; priority?: number; notes?: string }
    >({
      query: ({ productId, ...body }) => ({
        url: `/api/supplier/products/${productId}/substitutes`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { productId }) => [{ type: 'Product', id: productId }],
    }),
    deleteProductSubstitute: builder.mutation<any, { productId: string; substituteId: string }>({
      query: ({ productId, substituteId }) => ({
        url: `/api/supplier/products/${productId}/substitutes/${substituteId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { productId }) => [{ type: 'Product', id: productId }],
    }),
    getOrderSubstitutions: builder.query<any, string>({
      query: (orderId) => `/api/supplier/orders/${orderId}/substitutions`,
      providesTags: (_r, _e, id) => [{ type: 'Order', id }],
    }),
    proposeOrderSubstitution: builder.mutation<
      any,
      {
        orderId: string
        orderItemId: string
        substituteProductId: string
        description?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/api/supplier/orders/${orderId}/substitutions/propose`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }],
    }),
    getOrderFulfillmentIssues: builder.query<any, string>({
      query: (orderId) => `/api/supplier/orders/${orderId}/fulfillment-issues`,
      providesTags: (_r, _e, id) => [{ type: 'Order', id }],
    }),
    reportOrderShortage: builder.mutation<any, { orderId: string; body: Record<string, unknown> }>({
      query: ({ orderId, body }) => ({
        url: `/api/supplier/orders/${orderId}/fulfillment-issues/shortage`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }, 'Chat'],
    }),
    suggestOrderSubstitutionIssue: builder.mutation<
      any,
      { orderId: string; body: Record<string, unknown> }
    >({
      query: ({ orderId, body }) => ({
        url: `/api/supplier/orders/${orderId}/fulfillment-issues/substitution`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }, 'Chat'],
    }),
    openOrderFulfillmentChat: builder.mutation<
      any,
      { orderId: string; body: Record<string, unknown> }
    >({
      query: ({ orderId, body }) => ({
        url: `/api/supplier/orders/${orderId}/fulfillment-issues/open-chat`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }, 'Chat'],
    }),
    getSupplierAtRiskOrders: builder.query<any, void>({
      query: () => '/api/supplier/reorder-cadence/at-risk',
      providesTags: ['Order'],
    }),
  }),
})
