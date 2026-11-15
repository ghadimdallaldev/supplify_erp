export type FeaturedPackage = {
  pricing_key: string
  display_name?: string
  amount?: number
  duration_days?: number
  description?: string
  is_active?: boolean
}

export type FeaturedPlacement = {
  id: string
  supplier_id?: string
  pricing_key?: string
  status: string
  payment_status?: string
  amount_paid?: number
  billing_invoice_id?: string | null
  starts_at?: string
  ends_at?: string
  paymentRequired?: boolean
  invoiceId?: string
}

export type FeaturedPurchaseBody = {
  pricingKey: string
  paymentMethodId?: string
  idempotencyKey?: string
}

export type FeaturedPayBody = {
  paymentMethodId?: string
  idempotencyKey?: string
}
