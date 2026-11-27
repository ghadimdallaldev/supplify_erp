/**
 * Seeds attach products to leaf platform categories (Plan B Task 3): the product name is
 * matched first, then the seed's old category label, then the product falls back to "Other".
 */
import { classifyProduct, loadPlatformCategories } from '../../src/lib/category-matcher.js'

/**
 * @param {Array<{ id: string, slug: string, parent_category_id?: string|null }>} categories
 * @returns {(name: string, label?: string|null) => string} leaf category id
 */
export function seedCategoryResolver(categories) {
  const other = categories.find((c) => c.slug === 'other' && c.parent_category_id)
  if (!other) throw new Error('platform category "other" is missing — run migrations first')
  return (name, label = null) => {
    for (const text of [name, label]) {
      if (!text) continue
      const { autoCategoryId } = classifyProduct(text, categories)
      if (autoCategoryId) return autoCategoryId
    }
    return other.id
  }
}

/**
 * Product columns for a seeded product: the leaf category, and the review flag the backfill
 * verifier expects when legacy category text could only be placed on "Other".
 * @param {(name: string, label?: string|null) => string} resolve from seedCategoryResolver
 * @param {string} name product name
 * @param {string|null} [legacyText] the seed's old category label (also written to product.category)
 */
export function seedCategoryFields(resolve, name, legacyText = null) {
  const categoryId = resolve(name, legacyText)
  const other = resolve('', null)
  return {
    category_id: categoryId,
    category_needs_review: categoryId === other && Boolean(legacyText?.trim()),
  }
}

/** @param {{ query: Function }} [db] */
export async function loadSeedCategoryResolver(db) {
  return seedCategoryResolver(await loadPlatformCategories(db))
}

let cachedResolver = null

/** Same as loadSeedCategoryResolver, loaded once per seed process (the tree does not change mid-seed). */
export async function categoryResolver(db) {
  if (!cachedResolver) cachedResolver = loadSeedCategoryResolver(db)
  return cachedResolver
}
