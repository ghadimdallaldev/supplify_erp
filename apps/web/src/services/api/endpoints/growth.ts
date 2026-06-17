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
  eligibleSponsorPlans?: string[]
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
  useGetAdminGrowthSettingsQuery,
  useUpdateAdminGrowthSettingsMutation,
  useGetRestaurantConnectionRequestsQuery,
  useAcceptConnectionRequestMutation,
  useDeclineConnectionRequestMutation,
} = growthApi
