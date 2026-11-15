export type ConsumerFulfillmentType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN'

export type ConsumerOrderStatus =
  | 'RECEIVED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

export interface ConsumerMenuItem {
  id: string
  category_id: string
  name: string
  description?: string | null
  base_price: number
  image_url?: string | null
  is_available: boolean
  allergens?: string[]
  dietary_tags?: string[]
  sort_order?: number
}

export interface ConsumerMenuCategory {
  id: string
  name: string
  description?: string | null
  sort_order?: number
  is_active?: boolean
  items: ConsumerMenuItem[]
}

export interface ConsumerMenuAdminResponse {
  categories: ConsumerMenuCategory[]
}

export interface ConsumerOrderLine {
  id: string
  order_id: string
  menu_item_id: string
  item_name: string
  quantity: number
  unit_price: number
  line_total: number
  modifiers?: unknown
  notes?: string | null
}

export interface ConsumerOrderSummary {
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
  receipt_token?: string
  branch_name?: string
  lines?: ConsumerOrderLine[]
}

export interface ConsumerOrdersListResponse {
  orders: ConsumerOrderSummary[]
}

export interface ConsumerLoyaltyProgram {
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

export type UpsertConsumerLoyaltyProgramBody = {
  name?: string
  enabled?: boolean
  earnPointsPerCurrency?: number
  redeemCurrencyPerPoint?: number
  minRedeemPoints?: number
  welcomeBonusPoints?: number
  maxRedeemPercent?: number
  rulesJson?: ConsumerLoyaltyProgram['rules_json']
}
