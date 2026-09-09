/** Canonical allergen and dietary tag keys — keep in sync with apps/api/src/lib/consumer-menu-tags.js */

export const MENU_ALLERGENS = [
  'gluten',
  'dairy',
  'eggs',
  'fish',
  'shellfish',
  'tree_nuts',
  'peanuts',
  'soy',
  'sesame',
] as const

export const MENU_DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'halal',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'spicy',
] as const

export type MenuAllergen = (typeof MENU_ALLERGENS)[number]
export type MenuDietaryTag = (typeof MENU_DIETARY_TAGS)[number]

export function qrCodeImageUrl(data: string, size = 240): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
}

export async function downloadQrCode(data: string, filename: string): Promise<void> {
  const response = await fetch(qrCodeImageUrl(data, 400))
  if (!response.ok) throw new Error('QR download failed')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
