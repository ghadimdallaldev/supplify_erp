// Restaurant types
import type { Address } from './common'

export interface Restaurant {
  id: string
  name: string
  slug: string
  trade_license_no?: string
  contact_email: string
  phone?: string
  address_json?: Address
  logo_url?: string
  brand_primary?: string
  brand_accent?: string
  brand_display_name?: string
  created_at: string
  updated_at: string
}

export interface CreateRestaurantRequest {
  name: string
  slug: string
  tradeLicenseNo?: string
  contactEmail: string
  phone?: string
  address?: Address
}

export interface UpdateRestaurantRequest {
  name?: string
  slug?: string
  tradeLicenseNo?: string
  contactEmail?: string
  phone?: string
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
