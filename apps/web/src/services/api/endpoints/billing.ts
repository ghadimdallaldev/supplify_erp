import { api } from '../base'
import type {
  Subscription,
  Entitlements,
  BillingStatus,
  BillingPaymentMethod,
  UsageMeter,
} from '../../../types'
export const billingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentSubscription: builder.query<{ subscription: Subscription }, void>({
      query: () => '/api/subscriptions/current',
      providesTags: ['Subscription'],
      keepUnusedDataFor: 300,
    }),
    getEntitlements: builder.query<{ entitlements: Entitlements }, void>({
      query: () => '/api/subscriptions/entitlements',
      providesTags: ['Subscription'],
      keepUnusedDataFor: 120,
    }),
    getSubscriptionUsage: builder.query<UsageMeter & { meterType: string }, string>({
      query: (meterType) => `/api/subscriptions/usage/${meterType}`,
      providesTags: ['Subscription'],
    }),
    checkFeature: builder.query<{ featureKey: string; isEnabled: boolean }, string>({
      query: (featureKey) => `/api/subscriptions/features/${featureKey}`,
      providesTags: ['Subscription'],
    }),
    getRecommendation: builder.query<
      import('../../../types').PlanRecommendation,
      { blocked?: string }
    >({
      query: (params) => ({
        url: '/api/subscriptions/recommendation',
        params: params ?? {},
      }),
      providesTags: ['Subscription'],
    }),
    getSubscriptionPlans: builder.query<
      {
        plans: Array<{
          id: string
          code: string
          name: string
          limits: Record<string, unknown>
          features: Record<string, unknown>
          price_per_month?: number | null
          price_per_year?: number | null
          display_name?: string
          trial_eligible?: boolean
        }>
      },
      void
    >({
      query: () => '/api/subscriptions/plans',
      providesTags: ['Subscription'],
    }),
    recordConversionEvent: builder.mutation<
      { recorded: boolean },
      { eventType: string; metadata?: Record<string, unknown> }
    >({
      query: (body) => ({
        url: '/api/subscriptions/conversion-event',
        method: 'POST',
        body,
      }),
    }),

    getBillingStatus: builder.query<BillingStatus, void>({
      query: () => '/api/billing/status',
      providesTags: ['Billing', 'Subscription'],
      keepUnusedDataFor: 120,
    }),
    getBillingPaymentMethods: builder.query<{ paymentMethods: BillingPaymentMethod[] }, void>({
      query: () => '/api/billing/payment-methods',
      providesTags: ['Billing'],
    }),
    addBillingPaymentMethod: builder.mutation<
      { paymentMethod: BillingPaymentMethod },
      {
        type: 'CARD' | 'BANK_ACCOUNT'
        setAsDefault?: boolean
        provider?: string
        card?: {
          number?: string
          expMonth?: string | number
          expYear?: string | number
          accountLast4?: string
          bankName?: string
        }
      }
    >({
      query: (body) => ({
        url: '/api/billing/payment-methods',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Billing'],
    }),
    removeBillingPaymentMethod: builder.mutation<{ removed: boolean }, string>({
      query: (id) => ({
        url: `/api/billing/payment-methods/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Billing'],
    }),
    billingCheckout: builder.mutation<
      { success: boolean },
      {
        planId: string
        billingCycle: 'MONTHLY' | 'YEARLY'
        paymentMethodId?: string
        idempotencyKey?: string
        trialTargetPlanId?: string
      }
    >({
      query: (body) => ({
        url: '/api/billing/checkout',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          const { refetchAppSession } = await import('../../../lib/refetchAppSession')
          await refetchAppSession(dispatch)
        } catch {
          // Leave cache as-is on failure
        }
      },
    }),
    billingPayNow: builder.mutation<
      { allPaid: boolean },
      { paymentMethodId?: string; idempotencyKey?: string }
    >({
      query: (body) => ({
        url: '/api/billing/pay-now',
        method: 'POST',
        body: body ?? {},
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          const { refetchAppSession } = await import('../../../lib/refetchAppSession')
          await refetchAppSession(dispatch)
        } catch {
          // Leave cache as-is on failure
        }
      },
    }),
    setBillingAutoRenew: builder.mutation<{ autoRenew: boolean }, { autoRenew: boolean }>({
      query: (body) => ({
        url: '/api/billing/auto-renew',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Billing', 'Subscription'],
    }),
    unlockAdminSubscription: builder.mutation<
      { subscription: Subscription },
      { id: string; reason?: string; freeTrialDays?: number }
    >({
      query: ({ id, reason, freeTrialDays }) => ({
        url: `/api/admin-dashboard/subscriptions/${id}/unlock`,
        method: 'POST',
        body: { reason, freeTrialDays },
      }),
      invalidatesTags: ['Admin', 'Billing', 'Subscription'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          const { refetchAppSession } = await import('../../../lib/refetchAppSession')
          await refetchAppSession(dispatch)
        } catch {
          /* mutation failed â€” skip refetch */
        }
      },
    }),

    extendAdminFreeTrial: builder.mutation<
      {
        subscription: Subscription
        freeTrialDays: number
        freeSandboxExpiresAt: string | null
      },
      { id: string; days?: number }
    >({
      query: ({ id, days }) => ({
        url: `/api/admin-dashboard/subscriptions/${id}/extend-free-trial`,
        method: 'POST',
        body: days != null ? { days } : {},
      }),
      invalidatesTags: ['Admin', 'Billing', 'Subscription'],
    }),
  }),
})
