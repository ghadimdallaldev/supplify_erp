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
