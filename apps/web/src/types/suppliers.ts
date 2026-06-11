// Supplier types
import type { Address } from './common'

export interface Supplier {
  id: string
  name: string
  slug: string
  vat_no?: string
  contact_email: string
  phone?: string
  address_json?: Address
  logo_url?: string
  brand_primary?: string
  brand_accent?: string
  brand_display_name?: string
  public_catalog_enabled?: boolean
  created_at: string
  updated_at: string
}

export interface CreateSupplierRequest {
  name: string
  slug: string
  vatNo?: string
  contactEmail: string
  phone?: string
  address?: Address
}

export interface UpdateSupplierRequest {
  name?: string
  slug?: string
  vatNo?: string
  contactEmail?: string
  phone?: string
  address?: Address
}

export interface SupplierFilters {
  q?: string
  city?: string
  limit?: number
  offset?: number
}

export interface SuppliersResponse {
  suppliers: Supplier[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}
