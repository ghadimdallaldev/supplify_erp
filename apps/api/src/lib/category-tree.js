/**
 * Pure helpers over the platform category tree (Plan B Task 4): the department → category
 * tree with counts, supplier suggestions, and category matches for search.
 */
import {
  AUTO_MIN_SCORE,
  SUGGESTION_MIN_SCORE,
  classifyProduct,
  normalizeCategoryText,
  scoreCategory,
} from './category-matcher.js'

const STRONG_MATCH_SCORE = 0.8
const MAX_SEARCH_CATEGORIES = 5

function byDisplayOrder(a, b) {
  return (
    (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.name).localeCompare(String(b.name))
  )
}

function node(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    name_ar: row.name_ar ?? null,
    name_fr: row.name_fr ?? null,
    icon_key: row.icon_key ?? null,
    product_count: Number(row.product_count || 0),
  }
}

/**
 * @param {Array<{ id, slug, name, name_ar?, name_fr?, icon_key?, parent_category_id?, display_order?, product_count? }>} rows
 *   departments and leaves; a leaf's product_count is its distinct product count
 * @param {{ omitEmpty?: boolean }} [options] omitEmpty: drop leaves and departments with no products
 */
export function buildCategoryTree(rows, { omitEmpty = false } = {}) {
  const departments = rows.filter((r) => !r.parent_category_id).sort(byDisplayOrder)
  const leavesByParent = new Map()
  for (const row of rows) {
    if (!row.parent_category_id) continue
    if (!leavesByParent.has(row.parent_category_id)) leavesByParent.set(row.parent_category_id, [])
    leavesByParent.get(row.parent_category_id).push(row)
  }
  const tree = []
  for (const department of departments) {
    let categories = (leavesByParent.get(department.id) || []).sort(byDisplayOrder).map(node)
    if (omitEmpty) categories = categories.filter((c) => c.product_count > 0)
    const productCount = categories.reduce((n, c) => n + c.product_count, 0)
    if (omitEmpty && productCount === 0) continue
    tree.push({ ...node(department), product_count: productCount, categories })
  }
  return { departments: tree }
}

/**
 * Supplier suggestions for a product name.
 * @returns {{ suggestions: Array<{ categoryId, name, name_ar, departmentId, departmentName, departmentNameAr, score }>, autoCategoryId: string|null }}
 */
export function categorySuggestions(name, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const { suggestions, autoCategoryId } = classifyProduct(String(name ?? ''), categories)
  return {
    suggestions: suggestions.map(({ categoryId, score }) => {
      const leaf = byId.get(categoryId)
      const department = byId.get(leaf?.parent_category_id)
      return {
        categoryId,
        name: leaf?.name ?? null,
        name_ar: leaf?.name_ar ?? null,
        departmentId: department?.id ?? null,
        departmentName: department?.name ?? null,
        departmentNameAr: department?.name_ar ?? null,
        score,
      }
    }),
    autoCategoryId,
  }
}

function scoredLeaves(q, categories) {
  const input = normalizeCategoryText(String(q ?? ''))
  if (!input.tokens.length) return []
  const hits = []
  for (const category of categories) {
    if (!category.parent_category_id) continue
    const { score, matchedPhraseLength } = scoreCategory(input, category)
    if (score >= SUGGESTION_MIN_SCORE) hits.push({ category, score, matchedPhraseLength })
  }
  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.matchedPhraseLength - a.matchedPhraseLength ||
      byDisplayOrder(a.category, b.category)
  )
}

/**
 * Leaf categories matching a search query, for the grouped search `categories` group.
 * Strong matches (≥ 0.8) hide prefix-only noise; prefixes ("tom") count only when nothing
 * stronger matches, so search-as-you-type still finds categories.
 * @returns {Array<{ id, slug, name, name_ar, name_fr, icon_key, department_id, department_name, department_name_ar, score }>}
 */
export function matchCategoriesForQuery(q, categories, { limit = MAX_SEARCH_CATEGORIES } = {}) {
  let hits = scoredLeaves(q, categories)
  if (hits.some((h) => h.score >= STRONG_MATCH_SCORE)) {
    hits = hits.filter((h) => h.score >= STRONG_MATCH_SCORE)
  }
  const byId = new Map(categories.map((c) => [c.id, c]))
  return hits.slice(0, limit).map(({ category, score }) => {
    const department = byId.get(category.parent_category_id)
    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      name_ar: category.name_ar ?? null,
      name_fr: category.name_fr ?? null,
      icon_key: category.icon_key ?? null,
      department_id: category.parent_category_id,
      department_name: department?.name ?? null,
      department_name_ar: department?.name_ar ?? null,
      score,
    }
  })
}

/**
 * Leaf ids whose products a text search should also return: only exact or whole-phrase
 * matches (≥ 0.85), so "خبز" returns bread products but "tom" does not return all vegetables.
 */
export function productQueryCategoryIds(q, categories) {
  return scoredLeaves(q, categories)
    .filter((h) => h.score >= AUTO_MIN_SCORE)
    .map((h) => h.category.id)
}
