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
  /** Platform leaf category name (read-only label; set `category_id` to change it). */
  category?: string
  /** Leaf platform category. */
  category_id?: string | null
  category_name?: string | null
  category_name_ar?: string | null
  category_slug?: string | null
  department_id?: string | null
  department_name?: string | null
  department_name_ar?: string | null
  /** On "Other" waiting for the supplier to choose (or for a category request). */
  category_needs_review?: boolean
  /** The supplier's own shelves this product sits on. */
  shelf_ids?: string[]
  image_url?: string
  image_thumb_url?: string
  unit?: string
  created_at: string
  updated_at: string
  supplier_name?: string
  supplier_slug?: string
  supplier_email?: string
  /** Followers only; non-followers get `in_stock` instead (spec §10 Q2). */
  available_qty?: number
  /** Every restaurant that can see the catalog gets this flag. */
  in_stock?: boolean
  current_price?: number
  currency?: string
  is_favorited?: boolean
  favorited_at?: string
  /** Catalog list price before contract override */
  catalog_price?: number
  pricing_source?: 'DEFAULT_PRICE' | 'CONTRACT_PRICE' | 'QUOTE_PRICE'
  contract_price_id?: string | null
  contract_discount_percent?: number | null
  contract_valid_from?: string | null
  contract_valid_until?: string | null
  contract_min_order_quantity?: number | null
  /** Supplier MOQ from product_inventory_settings */
  moq?: number
  /** Pack / order multiple */
  order_multiple?: number
  /** Supplier minimum order amount (catalog join) */
  supplier_minimum_order_amount?: number | null
  /** Restaurant follows this product's supplier organisation (marketplace visibility). */
  is_followed?: boolean
  /** Ordering needs a follow; false means the UI shows "Follow & add". */
  can_order?: boolean
}

export interface CreateProductRequest {
  sku: string
  name: string
  name_ar?: string
  description?: string
  description_ar?: string
  brand?: string
  /** Required: an active leaf platform category. */
  category_id: string
  shelfIds?: string[]
  tags?: string[]
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
  /** A leaf platform category; never null. */
  category_id?: string
  /** Replaces the product's shelves when present. */
  shelfIds?: string[]
  tags?: string[]
  image_url?: string
  image_thumb_url?: string
  unit?: string
}

export interface ProductFilters {
  q?: string
  /** A department id (all its categories) or a leaf category id. */
  categoryId?: string
  /** Supplier: only products waiting for a category. */
  needsReview?: boolean
  /** Only products on this shelf. */
  shelfId?: string
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

/** A platform category node (department or leaf) as the categories tree returns it. */
export interface CategoryNode {
  id: string
  slug: string
  name: string
  name_ar?: string | null
  name_fr?: string | null
  /** Phosphor icon name (kebab-case), see components/marketplace/categoryIcons.ts. */
  icon_key?: string | null
  /** Restaurants: visible products; suppliers: their own products. */
  product_count: number
}

export interface CategoryDepartment extends CategoryNode {
  categories: CategoryNode[]
}

export interface CategoryTreeResponse {
  departments: CategoryDepartment[]
}

export interface CategorySuggestion {
  categoryId: string
  name: string
  name_ar?: string | null
  departmentId: string
  departmentName: string
  departmentNameAr?: string | null
  score: number
}

export interface CategorySuggestionsResponse {
  suggestions: CategorySuggestion[]
  /** Set only when the match is confident (score >= 0.85 with a clear lead). */
  autoCategoryId: string | null
}

/** A supplier branch's own product grouping ("shelf"). */
export interface SupplierShelf {
  id: string
  name: string
  name_ar?: string | null
  display_order: number
  product_count: number
  archived_at?: string | null
}

export type CategoryRequestStatus = 'pending' | 'approved' | 'merged' | 'rejected'

export interface CategoryRequest {
  id: string
  supplier_id?: string
  supplier_name?: string | null
  proposed_name: string
  proposed_name_ar?: string | null
  proposed_parent_id?: string | null
  proposed_parent_name?: string | null
  proposed_parent_name_ar?: string | null
  status: CategoryRequestStatus
  resolved_category_id?: string | null
  resolved_category_name?: string | null
  resolved_category_name_ar?: string | null
  admin_note?: string | null
  product_count?: number
  created_at: string
  resolved_at?: string | null
}

export interface CreateCategoryRequestBody {
  proposedName: string
  proposedNameAr?: string
  /** A department id. */
  proposedParentId?: string
  productIds?: string[]
}

/** Error body shared by catalog rules (shelves, categories, requests). */
export interface CatalogApiError {
  name: string
  code?: string
  message: string
  details?: {
    deals?: Array<{ id: string; name: string }>
    rules?: Array<{ id: string; name: string }>
    existingId?: string
  }
}
