import { api } from '../base'
import {
  normalizeContractPricingList,
  normalizeContractPricingRecord,
  normalizeMyContractPricing,
  normalizeResolvedContractPrices,
} from '../../../lib/contractPricingResponse'

export const contractPricingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getContractPricing: builder.query<
      { pricing: Array<Record<string, unknown>> },
      { restaurantId?: string; productId?: string; q?: string; status?: string }
    >({
      query: (params) => ({
        url: '/api/restaurant-pricing',
        params,
      }),
      providesTags: ['ContractPricing'],
      transformResponse: (response: unknown) => normalizeContractPricingList(response),
    }),
    getMyContractPricing: builder.query<
      {
        pricing: Array<Record<string, unknown>>
        summary: Array<Record<string, unknown>>
      },
      { supplierId?: string; productId?: string; q?: string }
    >({
      query: (params) => ({
        url: '/api/restaurant-pricing/my-pricing',
        params,
      }),
      providesTags: ['ContractPricing'],
      transformResponse: (response: unknown) => normalizeMyContractPricing(response),
    }),
    createContractPricing: builder.mutation<
      { pricing: Record<string, unknown> },
      {
        restaurantId: string
        productId: string
        price: number
        currency?: string
        contractDiscountPercentage?: number
        contractStartDate?: string
        contractEndDate?: string
        agreementType?: string
        minOrderQuantity?: number
        notes?: string
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-pricing',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ContractPricing', 'Product'],
      transformResponse: (response: unknown) => normalizeContractPricingRecord(response),
    }),
    updateContractPricing: builder.mutation<
      { pricing: Record<string, unknown> },
      {
        id: string
        price?: number
        contractDiscountPercentage?: number
        contractStartDate?: string | null
        contractEndDate?: string | null
        agreementType?: string
        minOrderQuantity?: number | null
        isActive?: boolean
        notes?: string | null
        restaurantId?: string
        productId?: string
      }
    >({
      query: ({ id, restaurantId: _r, productId: _p, ...body }) => ({
        url: `/api/restaurant-pricing/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['ContractPricing', 'Product'],
      transformResponse: (response: unknown) => normalizeContractPricingRecord(response),
    }),
    deactivateContractPricing: builder.mutation<{ pricing: Record<string, unknown> }, string>({
      query: (id) => ({
        url: `/api/restaurant-pricing/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ContractPricing', 'Product'],
      transformResponse: (response: unknown) => normalizeContractPricingRecord(response),
    }),
    resolveContractPrices: builder.mutation<
      {
        items: Array<{
          productId: string
          supplierId: string
          quantity: number
          unitPrice: number
          source: string
          defaultPrice: number | null
          contractPriceId: string | null
        }>
      },
      {
        items: Array<{ productId: string; supplierId: string; quantity: number }>
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-pricing/resolve',
        method: 'POST',
        body,
      }),
      transformResponse: (response: unknown) => normalizeResolvedContractPrices(response),
    }),
    messageFromDeal: builder.mutation<
      {
        conversation: Record<string, unknown>
        message: Record<string, unknown>
        initialMessage: string
      },
      string
    >({
      query: (id) => ({ url: `/api/promotions/${id}/message`, method: 'POST' }),
      invalidatesTags: ['Chat'],
    }),
    promoteDeal: builder.mutation<
      { promotion: Record<string, unknown> },
      { id: string; pricingKey?: string; budget?: number; targetAudience?: Record<string, unknown> }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/promotions/${id}/promote`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Promotions'],
    }),
    resumePromotion: builder.mutation<{ promotion: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/${id}/resume`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    previewDeal: builder.query<{ deal: Record<string, unknown> }, string>({
      query: (id) => `/api/promotions/${id}/preview`,
    }),
    getAdminDeals: builder.query<
      { deals: Array<Record<string, unknown>> },
      {
        status?: string
        supplierId?: string
        type?: string
        search?: string
        fromDate?: string
        toDate?: string
      }
    >({
      query: (params) => ({ url: '/api/promotions/admin/deals', params: params || {} }),
      providesTags: ['Promotions'],
      keepUnusedDataFor: 300,
    }),
    getAdminDealInsights: builder.query<{ insights: Record<string, unknown> }, void>({
      query: () => '/api/promotions/admin/deals/insights',
      providesTags: ['Promotions'],
      keepUnusedDataFor: 300,
    }),
    getAdminPendingDeals: builder.query<{ deals: Array<Record<string, unknown>> }, void>({
      query: () => '/api/promotions/admin/pending',
      providesTags: ['Promotions'],
    }),
    approveAdminDeal: builder.mutation<{ deal: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/admin/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    rejectAdminDeal: builder.mutation<
      { deal: Record<string, unknown> },
      { id: string; rejectionReason?: string; adminNotes?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/promotions/admin/${id}/reject`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Promotions'],
    }),
    pauseAdminDeal: builder.mutation<{ deal: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/admin/${id}/pause`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    submitPromotion: builder.mutation<
      { promotion: Record<string, unknown> },
      { id: string; pricingKey: string }
    >({
      query: ({ id, pricingKey }) => ({
        url: `/api/promotions/${id}/submit`,
        method: 'POST',
        body: { pricingKey },
      }),
      invalidatesTags: ['Promotions'],
    }),
    previewCartDeal: builder.mutation<
      { preview: Record<string, unknown> },
      {
        supplierId: string
        subtotal: number
        promotionId?: string
        couponCode?: string
        lineItems?: Array<Record<string, unknown>>
      }
    >({
      query: (body) => ({ url: '/api/promotions/cart-preview', method: 'POST', body }),
    }),
    updateAdminPromotionPricing: builder.mutation<
      { pricing: Record<string, unknown> },
      {
        key: string
        amount?: number
        durationDays?: number
        isActive?: boolean
        displayName?: string
        description?: string
        estimatedReachLabel?: string | null
        badgeLabel?: string | null
        isRecommended?: boolean
        sortOrder?: number
      }
    >({
      query: ({ key, ...body }) => ({
        url: `/api/promotions/admin/pricing/${key}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Promotions'],
    }),

    getAdminLimitKeys: builder.query<
      { keys: string[] },
      { tenantType?: 'RESTAURANT' | 'SUPPLIER' } | void
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/limit-keys',
        params: params || {},
      }),
      providesTags: ['Admin'],
      keepUnusedDataFor: 300,
    }),
    getAdminLimitOverrides: builder.query<
      {
        tenantOverrides: Array<Record<string, unknown>>
        planOverrides: Array<Record<string, unknown>>
      },
      {
        tenantType?: string
        tenantId?: string
        planId?: string
        limitKey?: string
        active?: string
      } | void
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/limit-overrides',
        params: params || {},
      }),
    }),
    createAdminPlanLimitOverride: builder.mutation<
      { override: Record<string, unknown> },
      {
        planId: string
        limit_type: string
        override_value: number
        expiration_date?: string | null
        reason?: string | null
      }
    >({
      query: ({ planId, ...body }) => ({
        url: `/api/admin-dashboard/plans/${planId}/override-limit`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    createAdminTenantLimitOverride: builder.mutation<
      { override: Record<string, unknown> },
      {
        tenantType: 'RESTAURANT' | 'SUPPLIER'
        tenantId: string
        limit_type: string
        override_value: number
        expiration_date?: string | null
        reason?: string | null
      }
    >({
      query: ({ tenantType, tenantId, ...body }) => ({
        url: `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/override-limit`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    getAdminEffectiveLimit: builder.query<
      {
        resolved: {
          baseLimit: number | null
          effectiveLimit: number | null
          tenantOverride?: unknown
          planOverride?: unknown
        }
        usage: { current?: number; limit?: number }
      },
      { tenantType: 'RESTAURANT' | 'SUPPLIER'; tenantId: string; limitKey: string }
    >({
      query: ({ tenantType, tenantId, limitKey }) =>
        `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/effective-limit/${limitKey}`,
    }),
    updateAdminTenantLimitOverride: builder.mutation<
      { override: Record<string, unknown> },
      {
        id: string
        override_value?: number
        expiration_date?: string | null
        reason?: string | null
        is_active?: boolean
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/admin-dashboard/tenant-overrides/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    updateAdminPlanLimitOverride: builder.mutation<
      { override: Record<string, unknown> },
      {
        id: string
        override_value?: number
        expiration_date?: string | null
        reason?: string | null
        is_active?: boolean
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/admin-dashboard/plan-overrides/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    getAdminSubscriptionAddons: builder.query<
      {
        billingTenantId: string
        tenantName?: string | null
        billingTenantName?: string | null
        usesOrgBilling?: boolean
        addons: Array<Record<string, unknown>>
        locationLimits: Record<string, unknown>
        planCode: string | null
        planName?: string | null
        overrides?: Array<Record<string, unknown>>
      },
      { tenantType: 'RESTAURANT' | 'SUPPLIER'; tenantId: string }
    >({
      query: ({ tenantType, tenantId }) =>
        `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/subscription-addons`,
      providesTags: (_r, _e, { tenantId, tenantType }) => [
        { type: 'Admin', id: `addons-${tenantType}-${tenantId}` },
      ],
    }),
    upsertAdminSubscriptionAddon: builder.mutation<
      { addon: Record<string, unknown> | null; cancelled?: boolean },
      {
        tenantType: 'RESTAURANT' | 'SUPPLIER'
        tenantId: string
        addonKey: string
        quantity: number
        unit_price_monthly?: number | null
        reason?: string | null
      }
    >({
      query: ({ tenantType, tenantId, addonKey, ...body }) => ({
        url: `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/subscription-addons/${addonKey}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_r, _e, { tenantId, tenantType }) => [
        { type: 'Admin', id: `addons-${tenantType}-${tenantId}` },
        'Admin',
      ],
    }),
  }),
})
