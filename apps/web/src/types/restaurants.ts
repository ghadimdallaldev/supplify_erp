// Restaurant types
import type { Address } from './common'

export interface Restaurant {
  id: string
  name: string
  slug: string
  trade_license_no?: string
  business_type?: string
  contact_email: string
  phone?: string
  address_json?: Address
  logo_url?: string
  brand_primary?: string
  brand_accent?: string
  brand_display_name?: string
  delivery_location_label?: string
  delivery_instructions?: string
  description?: string
  website?: string
  tax_id?: string
  vat_number?: string
  created_at: string
  updated_at: string
}

export interface CreateRestaurantRequest {
  name: string
  slug: string
  tradeLicenseNo?: string
  contactEmail: string
  phone?: string
  businessType?: string
  address?: Address
}

export interface UpdateRestaurantRequest {
  name?: string
  slug?: string
  tradeLicenseNo?: string
  taxId?: string
  vatNumber?: string
  deliveryInstructions?: string
  contactEmail?: string
  phone?: string
  businessType?: string
  address?: Address
}

export interface RestaurantFilters {
  q?: string
  city?: string
  limit?: number
  offset?: number
}

export interface RestaurantsResponse {
  restaurants: Restaurant[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}
