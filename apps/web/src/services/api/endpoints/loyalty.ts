import { api } from '../base'

export type SupplierLoyaltyProgram = {
  id?: string
  supplier_id?: string
  name: string
  enabled: boolean
  earn_points_per_currency: number
  redeem_currency_per_point: number
  min_redeem_points: number
  max_redeem_percent: number
  rules_json?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type SupplierLoyaltyBalance = {
  id: string
  supplier_id: string
  restaurant_id: string
  points_balance: number
  lifetime_earned: number
  lifetime_redeemed: number
  updated_at: string
  restaurant_name: string
}

export type SupplierLoyaltyLedgerEntry = {
  id: string
  supplier_id: string
  restaurant_id: string
  order_id?: string | null
  entry_type: 'EARN' | 'REDEEM' | 'ADJUST' | 'EXPIRE' | 'REVERSAL'
  points_delta: number
  balance_after: number
  monetary_value?: number | null
  reference_id?: string | null
  reference_type?: string | null
  notes?: string | null
  created_by?: string | null
  created_at: string
}

export type UpsertSupplierLoyaltyProgramRequest = {
  name?: string
  enabled?: boolean
  earnPointsPerCurrency?: number
  redeemCurrencyPerPoint?: number
  minRedeemPoints?: number
  maxRedeemPercent?: number
  rulesJson?: Record<string, unknown>
}

export const loyaltyApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSupplierLoyaltyProgram: builder.query<{ program: SupplierLoyaltyProgram | null }, void>({
      query: () => '/api/loyalty/supplier/program',
      providesTags: [{ type: 'SupplierLoyaltyProgram' as const, id: 'PROGRAM' }],
    }),
    upsertSupplierLoyaltyProgram: builder.mutation<
      { program: SupplierLoyaltyProgram },
      UpsertSupplierLoyaltyProgramRequest
    >({
      query: (body) => ({
        url: '/api/loyalty/supplier/program',
        method: 'PUT',
        body,
      }),
      invalidatesTags: [{ type: 'SupplierLoyaltyProgram', id: 'PROGRAM' }],
    }),
    getSupplierLoyaltyBalances: builder.query<
      { balances: SupplierLoyaltyBalance[] },
      { limit?: number; offset?: number } | void
    >({
      query: (params) => ({
        url: '/api/loyalty/supplier/balances',
        params: params || {},
      }),
      providesTags: ['SupplierLoyaltyProgram'],
    }),
    getSupplierLoyaltyLedger: builder.query<
      { ledger: SupplierLoyaltyLedgerEntry[] },
      { restaurantId: string; limit?: number; offset?: number }
    >({
      query: ({ restaurantId, ...params }) => ({
        url: `/api/loyalty/supplier/balances/${encodeURIComponent(restaurantId)}/ledger`,
        params,
      }),
      providesTags: (_r, _e, { restaurantId }) => [
        { type: 'SupplierLoyaltyProgram' as const, id: `ledger-${restaurantId}` },
      ],
    }),
  }),
})

export const {
  useGetSupplierLoyaltyProgramQuery,
  useUpsertSupplierLoyaltyProgramMutation,
  useGetSupplierLoyaltyBalancesQuery,
  useGetSupplierLoyaltyLedgerQuery,
} = loyaltyApi
