/** Contract / negotiated prices for restaurant tenants — aligned with ERP my-pricing API. */
export interface MyContractPrice {
  id: string
  product_id: string
  supplier_id: string
  price: number | null
  currency?: string
  product_name?: string
  product_sku?: string
  supplier_name?: string
  catalog_price?: number | null
  contract_discount_percentage?: number | null
  min_order_quantity?: number | null
  agreement_type?: string
  contract_start_date?: string | null
  contract_end_date?: string | null
}

export interface MyContractPricingSummary {
  supplier_id: string
  supplier_name: string
  product_count: number
}

export interface MyContractPricingResponse {
  pricing: MyContractPrice[]
  summary: MyContractPricingSummary[]
}

/** Supplier-managed contract price row — aligned with GET /api/restaurant-pricing. */
export interface ContractPriceRow {
  id: string
  restaurant_id: string
  product_id: string
  supplier_id: string
  price: number | null
  currency?: string
  restaurant_name?: string
  restaurant_email?: string
  product_name?: string
  product_sku?: string
  catalog_price?: number | null
  contract_discount_percentage?: number | null
  min_order_quantity?: number | null
  agreement_type?: string
  contract_start_date?: string | null
  contract_end_date?: string | null
  is_active?: boolean
  notes?: string | null
}

export interface ContractPricingListResponse {
  pricing: ContractPriceRow[]
}

export interface ContractPricingRecordResponse {
  pricing: ContractPriceRow
}
