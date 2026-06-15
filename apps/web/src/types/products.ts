// Product types
export interface Product {
  id: string
  supplier_id: string
  sku: string
  name: string
  name_ar?: string
  description?: string
  description_ar?: string
  brand?: string
  category?: string
  image_url?: string
  image_thumb_url?: string
  unit?: string
  created_at: string
  updated_at: string
  supplier_name?: string
  supplier_slug?: string
  supplier_email?: string
  available_qty?: number
  current_price?: number
  currency?: string
  is_favorited?: boolean
  favorited_at?: string
  /** Catalog list price before contract override */
  catalog_price?: number
  pricing_source?: 'DEFAULT_PRICE' | 'CONTRACT_PRICE'
  contract_price_id?: string | null
  contract_discount_percent?: number | null
  contract_valid_from?: string | null
  contract_valid_until?: string | null
  contract_min_order_quantity?: number | null
}

export interface CreateProductRequest {
  sku: string
  name: string
  name_ar?: string
  description?: string
  description_ar?: string
  brand?: string
  category?: string
  image_url?: string
  image_thumb_url?: string
  unit?: string
  supplier_id?: string
  warehouse_id?: string
  price?: number
  initialStock?: number
}

export interface UpdateProductRequest {
  sku?: string
  name?: string
  name_ar?: string
  description?: string
  description_ar?: string
  brand?: string
  category?: string
  image_url?: string
  image_thumb_url?: string
  unit?: string
}

export interface ProductFilters {
  q?: string
  category?: string
  supplier?: string
  inStock?: boolean
  includeStock?: boolean
  favoritesOnly?: boolean
  limit?: number
  offset?: number
  cursor?: string
}

export interface ProductsResponse {
  products: Product[]
  pagination: {
    total: number | null
    limit: number
    offset: number | null
    nextCursor?: string | null
  }
}
