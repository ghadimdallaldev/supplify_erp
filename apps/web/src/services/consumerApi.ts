import { api } from './api/base'
import type { ConsumerOrderLine } from '../lib/consumerOrderTracking'

export type ConsumerFulfillmentType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN'

export type ConsumerOrderStatus = 'RECEIVED' | 'PREPARING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

export type ConsumerMenuItem = {
  id: string
  name: string
  description?: string | null
  base_price: number
  image_url?: string | null
  is_available: boolean
  modifierGroups?: Array<{
    id: string
    name: string
    min_selections: number
    max_selections: number
    is_required: boolean
    options: Array<{
      id: string
      name: string
      price_delta: number
    }>
  }>
}

export type ConsumerMenuCategory = {
  id: string
  name: string
  description?: string | null
  items: ConsumerMenuItem[]
}

export type ConsumerOrderingMode = 'LIVE' | 'PREORDER_ONLY' | 'CLOSED'

export type ConsumerOrderingStatus = {
  mode: ConsumerOrderingMode
  allowAsap: boolean
  allowPreorders: boolean
  liveOrderStart: string
  liveOrderEnd: string
  allowPreordersOutsideLiveHours: boolean
  nextLiveOrderAt: string | null
  message: string
}

export type ConsumerFulfillmentBranch = {
  branchId: string
  branchName: string
  branchCode?: string | null
  deliveryEnabled: boolean
  takeawayEnabled: boolean
  dineInEnabled: boolean
  minOrderAmount: number
  deliveryFee: number
  estimatedPrepMinutes: number
  liveOrderStart?: string
  liveOrderEnd?: string
  allowPreordersOutsideLiveHours?: boolean
  ordering?: ConsumerOrderingStatus
  deliveryZones: Array<{
    id: string
    name: string
    postcode_prefix?: string | null
    delivery_fee: number
    min_order_amount: number
  }>
}

export type ConsumerOrderSummary = {
  id: string
  order_number: string
  fulfillment_type: ConsumerFulfillmentType
  status: ConsumerOrderStatus
  guest_name: string
  guest_email?: string | null
  guest_phone?: string | null
  subtotal: number
  delivery_fee: number
  total_amount: number
  created_at: string
  receipt_token: string
  restaurant_name?: string
  branch_name?: string
  lines?: ConsumerOrderLine[]
}

export type ConsumerFulfillmentConfig = {
  deliveryEnabled: boolean
  takeawayEnabled: boolean
  dineInEnabled: boolean
  minOrderAmount: number
  deliveryFee: number
  estimatedPrepMinutes: number
  liveOrderStart?: string
  liveOrderEnd?: string
  allowPreordersOutsideLiveHours?: boolean
}

export type ConsumerDeliveryZone = {
  id: string
  name: string
  postcode_prefix?: string | null
  delivery_fee: number
  min_order_amount: number
  is_active?: boolean
}

export type ConsumerOrderReceipt = {
  order: ConsumerOrderSummary
  lines: ConsumerOrderLine[]
  history: Array<{ status: string; created_at: string; notes?: string | null }>
  loyalty?: {
    pointsRedeemed: number
    discountAmount: number
    pointsEarned: number | null
  }
}

export type ConsumerMember = {
  id: string
  restaurantId: string
  username: string
  displayName: string
  email?: string | null
  phone?: string | null
  loyaltyPoints: number
  welcomeBonusAwarded: boolean
  createdAt: string
}

export type ConsumerLoyaltyLedgerEntry = {
  id: string
  entry_type: 'EARN' | 'REDEEM' | 'ADJUST' | 'EXPIRE' | 'REVERSAL'
  points_delta: number
  balance_after: number
  fulfillment_type?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

export type ConsumerLoyaltyProgram = {
  id?: string
  restaurant_id?: string
  name: string
  enabled: boolean
  earn_points_per_currency: number
  redeem_currency_per_point: number
  min_redeem_points: number
  welcome_bonus_points?: number
  max_redeem_percent?: number
  rules_json?: {
    fulfillment_multipliers?: Record<string, number>
  }
}

export type ConsumerLoyaltyPreview = {
  programEnabled: boolean
  programName: string
  memberBalance: number
  earnPoints: number
  minRedeemPoints: number
  redeemCurrencyPerPoint: number
  maxRedeemPercent: number
  welcomeBonusPoints: number
  suggestedRedeemPoints: number | null
  suggestedDiscount: number | null
  redeem: {
    pointsToRedeem?: number
    discountValue?: number
    remainingBalance?: number
    error?: string
  } | null
}

export type ConsumerMeResponse = {
  member: ConsumerMember | null
  program: ConsumerLoyaltyProgram | null
  recentLedger: ConsumerLoyaltyLedgerEntry[]
  recentOrders?: ConsumerMemberOrder[]
}

export type ConsumerMemberOrder = {
  id: string
  order_number: string
  status: ConsumerOrderStatus
  fulfillment_type: ConsumerFulfillmentType
  total_amount: number
  created_at: string
  receipt_token: string
}

export type ConsumerStorefront = {
  restaurant: {
    id: string
    slug: string
    name: string
    phone?: string | null
    logoUrl?: string | null
    operatingHours?: Record<string, { open?: string; close?: string; closed?: boolean }> | null
  }
  branches: ConsumerFulfillmentBranch[]
}

export const consumerApi = api.injectEndpoints({
  endpoints: (build) => ({
    getPublicConsumerRestaurant: build.query<
      { id: string; slug: string; name: string; phone?: string | null },
      string
    >({
      query: (slug) => `/api/public/restaurants/${encodeURIComponent(slug)}`,
    }),
    getPublicConsumerStorefront: build.query<ConsumerStorefront, string>({
      query: (slug) => `/api/public/consumer/${encodeURIComponent(slug)}/storefront`,
    }),
    getPublicConsumerMenu: build.query<
      {
        restaurant: { id: string; slug: string; name: string }
        menu: { categories: ConsumerMenuCategory[] }
      },
      { restaurantSlug: string; branchId?: string }
    >({
      query: ({ restaurantSlug, branchId }) => ({
        url: `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/menu`,
        params: branchId ? { branchId } : undefined,
      }),
      providesTags: (_r, _e, arg) => [{ type: 'ConsumerMenu' as const, id: arg.restaurantSlug }],
    }),
    getPublicConsumerFulfillmentOptions: build.query<
      {
        restaurant: { id: string; slug: string; name: string }
        branches: ConsumerFulfillmentBranch[]
      },
      { restaurantSlug: string; branchId?: string }
    >({
      query: ({ restaurantSlug, branchId }) => ({
        url: `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/fulfillment-options`,
        params: branchId ? { branchId } : undefined,
      }),
    }),
    createPublicConsumerOrder: build.mutation<
      { order: ConsumerOrderSummary; lines: unknown[]; receiptToken: string },
      {
        restaurantSlug: string
        branchId: string
        fulfillmentType: ConsumerFulfillmentType
        lines: Array<{
          menuItemId: string
          quantity: number
          modifierOptionIds?: string[]
          notes?: string
        }>
        guestName: string
        guestEmail?: string
        guestPhone?: string
        deliveryAddress?: Record<string, unknown>
        deliveryZoneId?: string
        notes?: string
        scheduledFor?: string
        pointsToRedeem?: number
      }
    >({
      query: ({ restaurantSlug, ...body }) => ({
        url: `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/orders`,
        method: 'POST',
        body,
      }),
    }),
    getPublicConsumerReceipt: build.query<
      ConsumerOrderReceipt,
      { restaurantSlug: string; receiptToken: string }
    >({
      query: ({ restaurantSlug, receiptToken }) =>
        `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/orders/${encodeURIComponent(receiptToken)}/receipt`,
    }),
    trackPublicConsumerOrder: build.mutation<
      ConsumerOrderReceipt,
      { restaurantSlug: string; orderNumber: string; email?: string; phone?: string }
    >({
      query: ({ restaurantSlug, ...body }) => ({
        url: `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/orders/track`,
        method: 'POST',
        body,
      }),
    }),
    getConsumerMenuAdmin: build.query<
      { categories: ConsumerMenuCategory[] },
      { branchId?: string } | void
    >({
      query: (args) => ({
        url: '/api/consumer/menu',
        params: args?.branchId ? { branchId: args.branchId } : undefined,
      }),
      providesTags: [{ type: 'ConsumerMenu' as const, id: 'ADMIN' }],
    }),
    createConsumerMenuCategory: build.mutation<
      { category: Record<string, unknown> },
      { name: string; description?: string; branchId?: string | null }
    >({
      query: (body) => ({ url: '/api/consumer/menu/categories', method: 'POST', body }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    createConsumerMenuItem: build.mutation<
      { item: Record<string, unknown> },
      {
        categoryId: string
        name: string
        basePrice: number
        description?: string
        branchId?: string | null
        imageUrl?: string | null
      }
    >({
      query: (body) => ({ url: '/api/consumer/menu/items', method: 'POST', body }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    updateConsumerMenuItem: build.mutation<
      { item: Record<string, unknown> },
      {
        id: string
        categoryId?: string
        name?: string
        basePrice?: number
        description?: string
        branchId?: string | null
        isAvailable?: boolean
        imageUrl?: string | null
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/consumer/menu/items/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    deleteConsumerMenuItem: build.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/api/consumer/menu/items/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    previewConsumerMenuImport: build.mutation<
      {
        totalRows: number
        validCount: number
        errorCount: number
        preview: Array<{
          rowNumber: number
          status: 'valid' | 'error'
          mapped: Record<string, unknown>
          errors: Array<{ field: string; message: string }>
        }>
      },
      { csv: string }
    >({
      query: (body) => ({
        url: '/api/consumer/menu/import/preview',
        method: 'POST',
        body,
      }),
    }),
    importConsumerMenu: build.mutation<
      {
        summary: {
          categoriesCreated: number
          itemsCreated: number
          itemsUpdated: number
          skipped: number
          failed: number
        }
        errors: Array<{ rowNumber: number; errors: Array<{ field: string; message: string }> }>
      },
      { csv: string; branchId?: string | null; updateExisting?: boolean }
    >({
      query: (body) => ({
        url: '/api/consumer/menu/import',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    createConsumerModifierGroup: build.mutation<
      { group: Record<string, unknown> },
      {
        menuItemId: string
        name: string
        minSelections?: number
        maxSelections?: number
        isRequired?: boolean
      }
    >({
      query: (body) => ({ url: '/api/consumer/menu/modifier-groups', method: 'POST', body }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    updateConsumerModifierGroup: build.mutation<
      { group: Record<string, unknown> },
      {
        id: string
        name?: string
        minSelections?: number
        maxSelections?: number
        isRequired?: boolean
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/consumer/menu/modifier-groups/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    deleteConsumerModifierGroup: build.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/api/consumer/menu/modifier-groups/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    createConsumerModifierOption: build.mutation<
      { option: Record<string, unknown> },
      {
        modifierGroupId: string
        name: string
        priceDelta?: number
        isAvailable?: boolean
      }
    >({
      query: (body) => ({ url: '/api/consumer/menu/modifier-options', method: 'POST', body }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    updateConsumerModifierOption: build.mutation<
      { option: Record<string, unknown> },
      {
        id: string
        name?: string
        priceDelta?: number
        isAvailable?: boolean
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/consumer/menu/modifier-options/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    deleteConsumerModifierOption: build.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/api/consumer/menu/modifier-options/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'ConsumerMenu', id: 'ADMIN' }],
    }),
    getConsumerOrders: build.query<
      { orders: ConsumerOrderSummary[] },
      { branchId?: string; status?: string } | void
    >({
      query: (args) => ({
        url: '/api/consumer/orders',
        params: args ?? undefined,
      }),
      providesTags: [{ type: 'ConsumerOrder' as const, id: 'LIST' }],
    }),
    getConsumerFulfillmentAdmin: build.query<
      { branches: ConsumerFulfillmentBranch[] },
      { branchId?: string } | void
    >({
      query: (args) => ({
        url: '/api/consumer/fulfillment',
        params: args?.branchId ? { branchId: args.branchId } : undefined,
      }),
      providesTags: [{ type: 'ConsumerFulfillment' as const, id: 'ADMIN' }],
    }),
    updateConsumerFulfillmentConfig: build.mutation<
      { config: Record<string, unknown> },
      {
        branchId: string
        deliveryEnabled?: boolean
        takeawayEnabled?: boolean
        dineInEnabled?: boolean
        minOrderAmount?: number
        deliveryFee?: number
        estimatedPrepMinutes?: number
        liveOrderStart?: string
        liveOrderEnd?: string
        allowPreordersOutsideLiveHours?: boolean
      }
    >({
      query: ({ branchId, ...body }) => ({
        url: `/api/consumer/fulfillment/${branchId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerFulfillment', id: 'ADMIN' }],
    }),
    createConsumerDeliveryZone: build.mutation<
      { zone: ConsumerDeliveryZone },
      {
        branchId: string
        name: string
        postcodePrefix?: string
        deliveryFee?: number
        minOrderAmount?: number
        isActive?: boolean
      }
    >({
      query: ({ branchId, ...body }) => ({
        url: `/api/consumer/fulfillment/${branchId}/zones`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerFulfillment', id: 'ADMIN' }],
    }),
    updateConsumerDeliveryZone: build.mutation<
      { zone: ConsumerDeliveryZone },
      {
        zoneId: string
        name?: string
        postcodePrefix?: string
        deliveryFee?: number
        minOrderAmount?: number
        isActive?: boolean
      }
    >({
      query: ({ zoneId, ...body }) => ({
        url: `/api/consumer/fulfillment/zones/${zoneId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerFulfillment', id: 'ADMIN' }],
    }),
    deleteConsumerDeliveryZone: build.mutation<{ deleted: boolean }, string>({
      query: (zoneId) => ({
        url: `/api/consumer/fulfillment/zones/${zoneId}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'ConsumerFulfillment', id: 'ADMIN' }],
    }),
    updateConsumerOrderStatus: build.mutation<
      { order: ConsumerOrderSummary },
      { id: string; status: ConsumerOrderStatus; notes?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/consumer/orders/${id}/status`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerOrder', id: 'LIST' }],
    }),
    consumerSignup: build.mutation<
      { member: ConsumerMember },
      { restaurantSlug: string; username: string; password: string; displayName?: string }
    >({
      query: ({ restaurantSlug, ...body }) => ({
        url: `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/auth/signup`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'ConsumerAuth' as const, id: arg.restaurantSlug }],
    }),
    consumerLogin: build.mutation<
      { member: ConsumerMember },
      { restaurantSlug: string; username: string; password: string }
    >({
      query: ({ restaurantSlug, ...body }) => ({
        url: `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/auth/login`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'ConsumerAuth' as const, id: arg.restaurantSlug }],
    }),
    consumerLogout: build.mutation<{ loggedOut: boolean }, string>({
      query: (restaurantSlug) => ({
        url: `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/auth/logout`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, restaurantSlug) => [
        { type: 'ConsumerAuth' as const, id: restaurantSlug },
      ],
    }),
    getConsumerMe: build.query<ConsumerMeResponse, string>({
      query: (restaurantSlug) =>
        `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/auth/me`,
      providesTags: (_r, _e, restaurantSlug) => [
        { type: 'ConsumerAuth' as const, id: restaurantSlug },
      ],
    }),
    getConsumerLoyaltyPreview: build.query<
      { preview: ConsumerLoyaltyPreview },
      {
        restaurantSlug: string
        subtotal: number
        fulfillmentType?: ConsumerFulfillmentType
        pointsToRedeem?: number
      }
    >({
      query: ({ restaurantSlug, subtotal, fulfillmentType, pointsToRedeem }) => ({
        url: `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/loyalty/preview`,
        params: {
          subtotal,
          ...(fulfillmentType ? { fulfillmentType } : {}),
          ...(pointsToRedeem ? { pointsToRedeem } : {}),
        },
      }),
    }),
    getConsumerLoyaltyProgram: build.query<{ program: ConsumerLoyaltyProgram | null }, void>({
      query: () => '/api/loyalty/consumer/program',
      providesTags: [{ type: 'ConsumerLoyaltyProgram' as const, id: 'PROGRAM' }],
    }),
    upsertConsumerLoyaltyProgram: build.mutation<
      { program: ConsumerLoyaltyProgram },
      {
        name?: string
        enabled?: boolean
        earnPointsPerCurrency?: number
        redeemCurrencyPerPoint?: number
        minRedeemPoints?: number
        welcomeBonusPoints?: number
        maxRedeemPercent?: number
        rulesJson?: ConsumerLoyaltyProgram['rules_json']
      }
    >({
      query: (body) => ({
        url: '/api/loyalty/consumer/program',
        method: 'PUT',
        body,
      }),
      invalidatesTags: [{ type: 'ConsumerLoyaltyProgram', id: 'PROGRAM' }],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetPublicConsumerRestaurantQuery,
  useGetPublicConsumerStorefrontQuery,
  useGetPublicConsumerMenuQuery,
  useGetPublicConsumerFulfillmentOptionsQuery,
  useCreatePublicConsumerOrderMutation,
  useGetPublicConsumerReceiptQuery,
  useTrackPublicConsumerOrderMutation,
  useGetConsumerMenuAdminQuery,
  useCreateConsumerMenuCategoryMutation,
  useCreateConsumerMenuItemMutation,
  useUpdateConsumerMenuItemMutation,
  useDeleteConsumerMenuItemMutation,
  usePreviewConsumerMenuImportMutation,
  useImportConsumerMenuMutation,
  useCreateConsumerModifierGroupMutation,
  useUpdateConsumerModifierGroupMutation,
  useDeleteConsumerModifierGroupMutation,
  useCreateConsumerModifierOptionMutation,
  useUpdateConsumerModifierOptionMutation,
  useDeleteConsumerModifierOptionMutation,
  useGetConsumerOrdersQuery,
  useGetConsumerFulfillmentAdminQuery,
  useUpdateConsumerFulfillmentConfigMutation,
  useCreateConsumerDeliveryZoneMutation,
  useUpdateConsumerDeliveryZoneMutation,
  useDeleteConsumerDeliveryZoneMutation,
  useUpdateConsumerOrderStatusMutation,
  useConsumerSignupMutation,
  useConsumerLoginMutation,
  useConsumerLogoutMutation,
  useGetConsumerMeQuery,
  useGetConsumerLoyaltyPreviewQuery,
  useGetConsumerLoyaltyProgramQuery,
  useUpsertConsumerLoyaltyProgramMutation,
} = consumerApi

export const MENU_IMPORT_CSV_TEMPLATE = `category,name,price,description,available,image_url
Starters,Hummus & Bread,12.00,Classic chickpea dip with warm bread,true,
Starters,Mutabal,11.00,Smoky eggplant dip,true,
Mains,Chicken Shawarma,16.50,,true,
Drinks,Fresh Lemonade,5.00,,true,`
