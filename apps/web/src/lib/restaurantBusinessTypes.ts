/**
 * Canonical restaurant business types for profile + deal targeting.
 * Keep in sync with apps/api/src/lib/restaurant-targeting.js
 */
export const RESTAURANT_BUSINESS_TYPES = [
  'fine_dining',
  'casual_dining',
  'fast_food',
  'cafe',
  'bakery',
  'hotel',
  'catering',
  'cloud_kitchen',
] as const

export type RestaurantBusinessType = (typeof RESTAURANT_BUSINESS_TYPES)[number]

/** Map legacy profile value `restaurant` → canonical type used by deals. */
export function coerceRestaurantBusinessType(value: string | null | undefined): string {
  if (!value) return 'casual_dining'
  const raw = String(value).trim().toLowerCase().replace(/\s+/g, '_')
  if (raw === 'restaurant' || raw === 'resto' || raw === 'dining' || raw === 'casual') {
    return 'casual_dining'
  }
  if ((RESTAURANT_BUSINESS_TYPES as readonly string[]).includes(raw)) return raw
  return raw
}
