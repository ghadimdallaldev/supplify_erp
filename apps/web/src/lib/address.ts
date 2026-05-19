export type AddressFields = {
  street: string
  city: string
  region: string
  country: string
}

const EMPTY_ADDRESS: AddressFields = {
  street: '',
  city: '',
  region: '',
  country: '',
}

function pickAddressField(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (value == null) continue
    if (typeof value === 'object') continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

/** Normalize API address JSON (or legacy string) into form-friendly strings. */
export function normalizeAddress(value: unknown): AddressFields {
  if (value == null) return { ...EMPTY_ADDRESS }
  if (typeof value === 'string') {
    return { ...EMPTY_ADDRESS, street: value }
  }
  if (typeof value !== 'object') {
    return { ...EMPTY_ADDRESS, street: String(value) }
  }

  const obj = value as Record<string, unknown>
  return {
    street: pickAddressField(obj, 'street', 'line1', 'line_1', 'address'),
    city: pickAddressField(obj, 'city'),
    region: pickAddressField(obj, 'region', 'state', 'province'),
    country: pickAddressField(obj, 'country'),
  }
}

/** Display address for lists (warehouses, etc.). */
export function formatAddressLine(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value !== 'object') return String(value)

  const parts = normalizeAddress(value)
  return [parts.street, parts.city, parts.region, parts.country].filter(Boolean).join(', ')
}
