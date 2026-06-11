// Price types
export interface Price {
  id: string
  product_id: string
  currency: string
  amount: number
  min_qty: number
  valid_from: string
  valid_to?: string
  product_name?: string
  sku?: string
}

export interface CreatePriceRequest {
  productId: string
  currency: string
  amount: number
  minQty?: number
  validFrom?: string
  validTo?: string
}

export interface UpdatePriceRequest {
  currency?: string
  amount?: number
  minQty?: number
  validFrom?: string
  validTo?: string
}
