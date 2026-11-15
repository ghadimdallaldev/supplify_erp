export type ActiveDeal = {
  id: string;
  name: string;
  description?: string;
  deal_type?: string;
  type?: string;
  discount_percent?: number;
  discount_amount?: number;
  discount_value?: number | string | null;
  supplier_id?: string;
  supplier_name?: string;
  starts_at?: string;
  ends_at?: string;
  is_sponsored?: boolean;
};

export type SupplierPromotion = {
  id: string;
  name: string;
  type?: string;
  status: string;
  payment_status?: string;
  discount_value?: number;
  boost_price_snapshot?: number | string;
  boost_pricing_key?: string;
  boost_duration_days?: number;
  billing_invoice_id?: string | null;
  starts_at?: string;
  ends_at?: string;
  created_at?: string;
};

export type CreatePromotionPayload = {
  name: string;
  description?: string | null;
  type: string;
  discountValue?: number | null;
  minOrderAmount?: number | null;
  couponCode?: string | null;
  ctaType?: string;
  startsAt: string;
  endsAt?: string | null;
  appliesTo?: "all" | "specific_products" | "specific_categories";
  productIds?: string[];
  categoryIds?: string[];
  targetRestaurantTypes?: string[];
  targetAreas?: string[];
  submitForReview?: boolean;
  pricingKey?: string;
};

export type PayActivationBody = {
  paymentMethodId?: string;
  idempotencyKey?: string;
};

export type PayActivationPaymentRequired = {
  paymentRequired: true;
  amount: number;
  pricingKey?: string;
  invoiceId?: string;
  message?: string;
};

export type PromotionAnalytics = {
  views?: number;
  clicks?: number;
  orders_influenced?: number;
  orders?: number;
  messages?: number;
  couponUses?: number;
  conversionRate?: number;
  total_discount?: number;
  adSpend?: number;
  attributedGmv?: number;
  roas?: number | null;
  costPerOrder?: number | null;
  promotion?: {
    id?: string;
    budget?: number;
    pricePaid?: number;
    status?: string;
    impressions?: number;
  } | null;
};

export type PromotionsAnalyticsSummary = {
  periodDays?: number;
  totalDeals?: number;
  activeDeals?: number;
  pendingDeals?: number;
  views?: number;
  clicks?: number;
  ordersInfluenced?: number;
  adSpend?: number;
  attributedGmv?: number;
  roas?: number | null;
  conversionRate?: number;
  totalDiscount?: number;
};

export type BoostPackage = {
  pricing_key: string;
  display_name?: string;
  amount?: number;
  duration_days?: number;
  description?: string;
  is_recommended?: boolean;
  is_active?: boolean;
};
