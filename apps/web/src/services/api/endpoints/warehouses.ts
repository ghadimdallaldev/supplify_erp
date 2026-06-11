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

export const warehousesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getWarehouses: builder.query<{ warehouses: any[] }, void>({
      query: () => '/api/warehouses',
      providesTags: ['Inventory'],
    }),
    createWarehouse: builder.mutation<
      { warehouse: any },
      {
        name: string
        code?: string
        address?: string
        city?: string
        country?: string
        capacity?: number
        contact_name?: string
        contact_email?: string
        contact_phone?: string
        type?: string
      }
    >({
      query: (body) => ({
        url: '/api/warehouses',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory'],
    }),
    setDefaultWarehouse: builder.mutation<{ warehouse: any }, string>({
      query: (id) => ({ url: `/api/warehouses/${id}/set-default`, method: 'POST' }),
      invalidatesTags: ['Inventory'],
    }),
    getSupplierFulfillment: builder.query<{ fulfillment: any }, void>({
      query: () => '/api/suppliers/me/fulfillment',
    }),
    updateSupplierFulfillment: builder.mutation<
      { fulfillment: any },
      {
        multi_warehouse_enabled?: boolean
        fulfillment_mode?: 'single' | 'multi'
        confirm_disable?: boolean
      }
    >({
      query: (body) => ({ url: '/api/suppliers/me/fulfillment', method: 'PATCH', body }),
      invalidatesTags: ['User'],
    }),
    getWarehouseRoutingRules: builder.query<{ rules: any[] }, void>({
      query: () => '/api/warehouses/routing/rules',
    }),
    simulateWarehouseRouting: builder.mutation<
      { preview: any[] },
      { items: Array<{ productId: string; quantity: number }>; restaurant_id?: string }
    >({
      query: (body) => ({
        url: '/api/warehouses/routing/simulate',
        method: 'POST',
        body: {
          items: body.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
          restaurant_id: body.restaurant_id,
        },
      }),
    }),
    getOrderWarehouseAssignments: builder.query<
      { assignments: any[]; multiLocation: boolean },
      string
    >({
      query: (orderId) => `/api/orders/${orderId}/warehouses`,
    }),
  }),
})
