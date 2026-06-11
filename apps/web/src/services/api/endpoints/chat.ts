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

export const chatApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getConversations: builder.query<any, void>({
      query: () => '/api/chat/conversations',
      providesTags: ['Chat'],
    }),
    startSupportChat: builder.mutation<
      { conversation: { id: string }; created: boolean },
      { initialMessage?: string; category?: string; pageUrl?: string }
    >({
      query: (body) => ({
        url: '/api/chat/support/start',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Chat'],
    }),
    getSupportConversations: builder.query<{ conversations: unknown[] }, void>({
      query: () => '/api/chat/support/conversations',
      providesTags: ['Chat'],
    }),
    getAdminSupportConversations: builder.query<{ conversations: unknown[] }, void>({
      query: () => '/api/chat/admin/conversations',
      providesTags: ['Chat'],
    }),
    getFeaturedPlacementPackages: builder.query<{ packages: unknown[] }, void>({
      query: () => '/api/suppliers/featured-placement/packages',
      providesTags: ['Supplier'],
    }),
    getMyFeaturedPlacements: builder.query<{ placements: unknown[] }, void>({
      query: () => '/api/suppliers/featured-placement/mine',
      providesTags: ['Supplier'],
    }),
    purchaseFeaturedPlacement: builder.mutation<{ placement: unknown }, { pricingKey: string }>({
      query: (body) => ({
        url: '/api/suppliers/featured-placement/purchase',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Supplier'],
    }),
    getAdminFeaturedPlacements: builder.query<{ placements: unknown[] }, void>({
      query: () => '/api/suppliers/featured-placement/admin/active',
      providesTags: ['Admin'],
    }),
    getMessages: builder.query<any, { conversationId: string }>({
      query: ({ conversationId }) => `/api/chat/conversations/${conversationId}/messages`,
      providesTags: ['Chat'],
    }),
    createConversation: builder.mutation<any, { supplierId?: string; restaurantId?: string }>({
      query: (body) => ({
        url: '/api/chat/conversations',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Chat'],
    }),
    sendMessage: builder.mutation<
      any,
      {
        conversationId: string
        content: string
        messageType?: string
        orderId?: string
        replyTo?: string
        attachments?: Array<{
          fileUrl: string
          fileType: string
          fileName: string
          fileSize?: number
        }>
      }
    >({
      query: ({ conversationId, ...body }) => ({
        url: `/api/chat/conversations/${conversationId}/messages`,
        method: 'POST',
        body,
      }),
      async onQueryStarted({ conversationId, content, ...rest }, { dispatch, queryFulfilled }) {
        const tempId = `opt-${Date.now()}`
        const optimisticMessage = {
          id: tempId,
          content,
          ...rest,
          created_at: new Date().toISOString(),
          isOptimistic: true,
          sender_type: undefined,
        }
        const patchResult = dispatch(
          (api.util.updateQueryData as any)('getMessages', { conversationId }, (draft: any) => {
            if (!draft?.messages) return
            draft.messages = [...(draft.messages || []), optimisticMessage]
          })
        )
        try {
          const { data } = await queryFulfilled
          const serverMessage = data?.message
          if (serverMessage?.id) {
            dispatch(
              (api.util.updateQueryData as any)('getMessages', { conversationId }, (draft: any) => {
                if (!draft?.messages) return
                const withoutTemp = (draft.messages as { id?: string }[]).filter(
                  (m) => m.id !== tempId
                )
                const exists = withoutTemp.some((m) => m.id === serverMessage.id)
                draft.messages = exists ? withoutTemp : [...withoutTemp, serverMessage]
              })
            )
          }
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: ['Chat'],
    }),
    markConversationRead: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/api/chat/conversations/${conversationId}/read`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Chat'],
    }),
    markMessageRead: builder.mutation<any, string>({
      query: (messageId) => ({
        url: `/api/chat/messages/${messageId}/read`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Chat'],
    }),
    pinConversation: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/api/chat/conversations/${conversationId}/pin`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Chat'],
    }),
    archiveConversation: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/api/chat/conversations/${conversationId}/archive`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Chat'],
    }),
    deleteConversation: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/api/chat/conversations/${conversationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Chat'],
    }),
  }),
})
