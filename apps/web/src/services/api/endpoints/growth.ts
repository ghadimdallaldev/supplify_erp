import { api } from '../base'

/** Example CSV for supplier customer import (matches import column aliases). */
export const CUSTOMER_IMPORT_CSV_TEMPLATE = `Restaurant Name,Contact Person,Phone,Email,Address,Area/Region,Credit Limit,Payment Terms,Sales Representative,Notes
The Coastal Kitchen,John Smith,+1-555-0101,john@coastalkitchen.com,123 Harbor Blvd,San Diego,5000,Net 30,Alex Rivera,Preferred delivery Tue/Thu
Green Leaf Bistro,Maria Chen,+1-555-0102,maria@greenleaf.com,45 Oak Street,Portland,2500,Net 15,Jordan Lee,
Downtown Diner,,+1-555-0103,,789 Main Ave,Chicago,,Net 30,,Phone-only contact`

export type ReferralProgramConfig = {
  firstPaidDiscountPercent: number
  supplierRewardType: 'free_month' | 'account_credit'
  referralValidityDays: number
  sponsorshipLimitsPerYear: Record<string, number | null>
  eligibleSponsorPlans: string[]
  connectionRequestExpiryDays: number
  sponsorshipEnabled?: boolean
  offerExpiryDays?: number
  referralDiscountAppliesTo?: 'first_restaurant_funded' | 'sponsored_cycle'
  requireRestaurantPaymentMethodBeforeActivation?: boolean
  supplierPaymentAfterAcceptance?: boolean
  maxSponsoredAmount?: number | null
  supportedBillingIntervals?: string[]
  paymentPendingStaleDays?: number
}

export type SponsorshipUsage = {
  used: number
  remaining: number | null
  limit: number | null
  resetDate: string
  unlimited: boolean
}

export type SupplierProspect = {
  id: string
  restaurant_name: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  area_region?: string | null
  match_status: string
  matched_restaurant_id?: string | null
  matched_restaurant_name?: string | null
  lifecycle_status: string
  created_at: string
}

export type RestaurantConnectionRequest = {
  id: string
  supplier_id: string
  supplier_name: string
  restaurant_id: string
  status: string
  expires_at: string
  created_at: string
}

export type SupplierSponsorship = {
  id: string
  supplier_id: string
  prospect_id?: string | null
  restaurant_id?: string | null
  status: string
  plan_code: string
  selected_plan_id?: string | null
  selected_plan_name?: string | null
  sponsored_amount?: number | null
  currency?: string
  offer_expires_at?: string | null
  supplier_payment_status?: string | null
  period_start?: string | null
  period_end?: string | null
  failure_reason?: string | null
  prospect_name?: string | null
  supplier_name?: string | null
  price_per_month?: number | null
  pricing_snapshot?: Record<string, unknown> | null
  created_at: string
}

export type SupplierGrowthMetrics = {
  importedCustomers: number
  existingSupplifyCustomers: number
  invitedCustomers: number
  sponsoredCustomers: number
  registeredCustomers: number
  convertedCustomers: number
  revenueGenerated: number
  rewardsEarned: { freeMonths: number; accountCredit: number }
  sponsorshipLimit?: number | null
  sponsorshipUsage?: SponsorshipUsage
  eligibleSponsorPlans?: string[]
  sponsorship?: {
    offersCreated: number
    offersAccepted: number
    offersDeclined: number
    offersExpired: number
    paymentsPending: number
    paymentsFailed: number
    monthsActivated: number
    monthsCompleted: number
    totalSpend: number
    averageValue: number
  }
}

export type RestaurantConnectionRequest = {
  id: string
  supplier_id: string
  supplier_name: string
  restaurant_id: string
  status: string
  expires_at: string
  created_at: string
}

export const growthApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSupplierGrowthMetrics: builder.query<SupplierGrowthMetrics, void>({
      query: () => '/api/supplier/growth/metrics',
      providesTags: ['SupplierGrowth'],
    }),
    getSupplierProspects: builder.query<
      { prospects: SupplierProspect[]; total: number },
      { limit?: number; offset?: number; lifecycleStatus?: string }
    >({
      query: (params) => ({
        url: '/api/supplier/growth/customers/prospects',
        params,
      }),
      providesTags: ['SupplierGrowth'],
    }),
    previewCustomerImport: builder.mutation<
      {
        headers: string[]
        preview: unknown[]
        totalRows: number
        validCount: number
        errorCount: number
        errors: unknown[]
      },
      { csv: string }
    >({
      query: (body) => ({
        url: '/api/supplier/growth/customers/import/preview',
        method: 'POST',
        body,
      }),
    }),
    executeCustomerImport: builder.mutation<
      { created: number; skipped: number; failed: number; batchId: string },
      { csv: string }
    >({
      query: (body) => ({
        url: '/api/supplier/growth/customers/import',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SupplierGrowth'],
    }),
    inviteProspect: builder.mutation<
      { inviteUrl: string; whatsappUrl?: string | null; message: string },
      { prospectId: string; channel: 'email' | 'whatsapp' | 'link' }
    >({
      query: ({ prospectId, channel }) => ({
        url: `/api/supplier/growth/customers/prospects/${prospectId}/invite`,
        method: 'POST',
        body: { channel },
      }),
      invalidatesTags: ['SupplierGrowth'],
    }),
    connectProspect: builder.mutation<unknown, { prospectId: string }>({
      query: ({ prospectId }) => ({
        url: `/api/supplier/growth/customers/prospects/${prospectId}/connect`,
        method: 'POST',
      }),
      invalidatesTags: ['SupplierGrowth'],
    }),
    sponsorProspect: builder.mutation<unknown, { prospectId: string; planCode: string }>({
      query: ({ prospectId, planCode }) => ({
        url: `/api/supplier/growth/customers/prospects/${prospectId}/sponsor`,
        method: 'POST',
        body: { planCode },
      }),
      invalidatesTags: ['SupplierGrowth'],
    }),
    createSponsorshipOffer: builder.mutation<
      { sponsorship: SupplierSponsorship },
      {
        prospectId: string
        suggestedPlanId?: string
        idempotencyKey?: string
      }
    >({
      query: (body) => ({
        url: '/api/supplier/growth/sponsorships',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SupplierGrowth'],
    }),
    getSupplierSponsorships: builder.query<
      { sponsorships: SupplierSponsorship[]; total: number },
      { status?: string; limit?: number } | void
    >({
      query: (params) => ({
        url: '/api/supplier/growth/sponsorships',
        params: params || undefined,
      }),
      providesTags: ['SupplierGrowth'],
    }),
    getSponsorshipEligibility: builder.query<
      { eligible: boolean; reasons: string[]; usage: SponsorshipUsage },
      { prospectId?: string } | void
    >({
      query: (params) => ({
        url: '/api/supplier/growth/sponsorships/eligibility',
        params: params || undefined,
      }),
    }),
    quoteSponsorship: builder.mutation<
      {
        snapshot: {
          planId: string
          planName: string
          finalSponsoredAmount: number
          currency: string
          baseAmount: number
          taxAmount: number
        }
        disclosure: string
      },
      { planId: string; prospectId?: string }
    >({
      query: (body) => ({
        url: '/api/supplier/growth/sponsorships/quote',
        method: 'POST',
        body,
      }),
    }),
    cancelSponsorship: builder.mutation<unknown, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/api/supplier/growth/sponsorships/${id}/cancel`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['SupplierGrowth'],
    }),
    paySponsorship: builder.mutation<
      unknown,
      { id: string; paymentMethodId?: string; idempotencyKey: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/supplier/growth/sponsorships/${id}/payment`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SupplierGrowth'],
    }),
    retrySponsorshipPayment: builder.mutation<
      unknown,
      { id: string; paymentMethodId?: string; idempotencyKey?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/supplier/growth/sponsorships/${id}/retry-payment`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SupplierGrowth'],
    }),
    getRestaurantSponsorshipOffers: builder.query<{ offers: SupplierSponsorship[] }, void>({
      query: () => '/api/restaurant/growth/sponsorship-offers',
      providesTags: ['Supplier'],
    }),
    acceptSponsorshipOffer: builder.mutation<unknown, { id: string; planId: string }>({
      query: ({ id, planId }) => ({
        url: `/api/restaurant/growth/sponsorship-offers/${id}/accept`,
        method: 'POST',
        body: { planId },
      }),
      invalidatesTags: ['Supplier'],
    }),
    declineSponsorshipOffer: builder.mutation<unknown, string>({
      query: (id) => ({
        url: `/api/restaurant/growth/sponsorship-offers/${id}/decline`,
        method: 'POST',
      }),
      invalidatesTags: ['Supplier'],
    }),
    getAdminGrowthSettings: builder.query<ReferralProgramConfig, void>({
      query: () => '/api/admin-dashboard/growth-settings',
      providesTags: ['Admin'],
    }),
    updateAdminGrowthSettings: builder.mutation<
      ReferralProgramConfig,
      Partial<ReferralProgramConfig>
    >({
      query: (body) => ({
        url: '/api/admin-dashboard/growth-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    getRestaurantConnectionRequests: builder.query<
      { requests: RestaurantConnectionRequest[] },
      void
    >({
      query: () => '/api/restaurant/growth/connection-requests',
      providesTags: ['Supplier'],
    }),
    acceptConnectionRequest: builder.mutation<unknown, string>({
      query: (id) => ({
        url: `/api/restaurant/growth/connection-requests/${id}/accept`,
        method: 'POST',
      }),
      invalidatesTags: ['Supplier'],
    }),
    declineConnectionRequest: builder.mutation<unknown, string>({
      query: (id) => ({
        url: `/api/restaurant/growth/connection-requests/${id}/decline`,
        method: 'POST',
      }),
      invalidatesTags: ['Supplier'],
    }),
  }),
})

export const {
  useGetSupplierGrowthMetricsQuery,
  useGetSupplierProspectsQuery,
  usePreviewCustomerImportMutation,
  useExecuteCustomerImportMutation,
  useInviteProspectMutation,
  useConnectProspectMutation,
  useSponsorProspectMutation,
  useCreateSponsorshipOfferMutation,
  useGetSupplierSponsorshipsQuery,
  useGetSponsorshipEligibilityQuery,
  useQuoteSponsorshipMutation,
  useCancelSponsorshipMutation,
  usePaySponsorshipMutation,
  useRetrySponsorshipPaymentMutation,
  useGetRestaurantSponsorshipOffersQuery,
  useAcceptSponsorshipOfferMutation,
  useDeclineSponsorshipOfferMutation,
  useGetAdminGrowthSettingsQuery,
  useUpdateAdminGrowthSettingsMutation,
  useGetRestaurantConnectionRequestsQuery,
  useAcceptConnectionRequestMutation,
  useDeclineConnectionRequestMutation,
} = growthApi
