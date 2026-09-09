/** Canonical allergen and dietary tag keys for guest menu items. */
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
]

export const MENU_DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'halal',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'spicy',
]

export function sanitizeMenuTagList(values, allowed) {
  if (!Array.isArray(values)) return []
  const allowedSet = new Set(allowed)
  return [...new Set(values.filter((v) => typeof v === 'string' && allowedSet.has(v)))]
}

export function validateMenuTags(allergens, dietaryTags) {
  const invalidAllergens = (allergens ?? []).filter((a) => !MENU_ALLERGENS.includes(a))
  const invalidDietary = (dietaryTags ?? []).filter((d) => !MENU_DIETARY_TAGS.includes(d))
  if (invalidAllergens.length || invalidDietary.length) {
    throw Object.assign(new Error('Invalid menu tags'), {
      name: 'INVALID_MENU_TAGS',
      details: { invalidAllergens, invalidDietary },
    })
  }
}
