/**
 * Canonical restaurant business types + location matching for deal/boost targeting.
 * Keep in sync with apps/web/src/lib/restaurantBusinessTypes.ts
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
]

/** Legacy / alternate values map to canonical types for matching. */
export const BUSINESS_TYPE_ALIASES = {
  restaurant: 'casual_dining',
  resto: 'casual_dining',
  dining: 'casual_dining',
  casual: 'casual_dining',
  fine: 'fine_dining',
  'fine-dining': 'fine_dining',
  fastfood: 'fast_food',
  'fast-food': 'fast_food',
  qsr: 'fast_food',
  coffee: 'cafe',
  café: 'cafe',
  cloudkitchen: 'cloud_kitchen',
  'cloud-kitchen': 'cloud_kitchen',
  ghost_kitchen: 'cloud_kitchen',
}

export function normalizeBusinessType(value) {
  if (value == null || value === '') return ''
  const raw = String(value).trim().toLowerCase().replace(/\s+/g, '_')
  if (BUSINESS_TYPE_ALIASES[raw]) return BUSINESS_TYPE_ALIASES[raw]
  if (RESTAURANT_BUSINESS_TYPES.includes(raw)) return raw
  return raw
}

export function businessTypeMatches(targetTypes, restaurantBusinessType) {
  if (!Array.isArray(targetTypes) || targetTypes.length === 0) return true
  const restaurantType = normalizeBusinessType(restaurantBusinessType)
  if (!restaurantType) return false
  return targetTypes.some((t) => normalizeBusinessType(t) === restaurantType)
}

export function parseJsonStringArray(value) {
  if (value == null) return []
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean)
    } catch {
      const trimmed = value.trim()
      return trimmed ? [trimmed] : []
    }
  }
  return []
}

function normalizeLocationToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Build searchable location text from restaurant profile fields.
 * Includes city, area/neighborhood, region/state, country, street, delivery label.
 */
export function buildLocationHaystack(restaurant) {
  const parts = [
    restaurant?.city,
    restaurant?.area,
    restaurant?.region,
    restaurant?.state,
    restaurant?.province,
    restaurant?.country,
    restaurant?.address,
    restaurant?.street,
    restaurant?.delivery_location_label,
    restaurant?.deliveryLocationLabel,
  ]
  return normalizeLocationToken(parts.filter(Boolean).join(' | '))
}

/**
 * Area match: target area must appear as a substring of the restaurant location haystack
 * (or vice versa for short city aliases). Empty targets = match all.
 */
export function locationMatchesAreas(targetAreas, restaurant) {
  if (!Array.isArray(targetAreas) || targetAreas.length === 0) return true
  const haystack = buildLocationHaystack(restaurant)
  if (!haystack) return false
  return targetAreas.some((area) => {
    const needle = normalizeLocationToken(area)
    if (!needle) return false
    if (haystack.includes(needle)) return true
    // Allow restaurant city "Beirut" to match target "beirut downtown" when city is exact token
    const tokens = haystack.split(' | ')
    return tokens.some((token) => token === needle || needle.includes(token))
  })
}

/**
 * Normalize DB restaurant row (+ address_json) into targeting shape.
 */
export function restaurantRowForTargeting(row) {
  if (!row) return null
  const addr =
    typeof row.address_json === 'string'
      ? (() => {
          try {
            return JSON.parse(row.address_json)
          } catch {
            return {}
          }
        })()
      : row.address_json || {}

  return {
    id: row.id,
    name: row.name,
    business_type: row.business_type || '',
    city: addr.city || '',
    area: addr.area || addr.neighborhood || addr.district || '',
    region: addr.region || '',
    state: addr.state || addr.region || addr.province || '',
    province: addr.province || '',
    country: addr.country || '',
    street: addr.street || addr.line1 || addr.line_1 || addr.address || '',
    address: addr.line1 || addr.street || addr.line_1 || addr.address || '',
    delivery_location_label: row.delivery_location_label || '',
  }
}

/**
 * Build deal_promotions.target_audience from promotions targeting columns.
 */
export function buildBoostTargetAudienceFromDeal(deal) {
  const restaurantTypes = parseJsonStringArray(deal?.target_restaurant_types)
  const areas = parseJsonStringArray(deal?.target_areas)
  if (restaurantTypes.length === 0 && areas.length === 0) {
    return { all: true }
  }
  return {
    all: false,
    restaurantTypes,
    areas,
  }
}
