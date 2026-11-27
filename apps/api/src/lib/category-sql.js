/**
 * SQL helpers for reading platform categories while the category backfill may not be verified.
 * A product's `category_id` can still point at a supplier-owned or non-leaf category until the
 * backfill finishes; readers map those to the platform "Other" leaf so the API keeps serving.
 */

export const OTHER_CATEGORY_SLUG = 'other'

/** Expression: the id of the platform "Other" leaf. */
export const OTHER_CATEGORY_ID_SQL = `(SELECT oc.id FROM product_category oc
  WHERE oc.slug = '${OTHER_CATEGORY_SLUG}' AND oc.supplier_id IS NULL AND oc.parent_category_id IS NOT NULL
  LIMIT 1)`

/**
 * Expression: `<alias>.category_id` when it is a leaf platform category, otherwise the
 * "Other" leaf id (NULL, supplier-owned and department ids included).
 * @param {string} productAlias SQL alias of the product row (trusted identifier, not input)
 */
export function leafCategoryIdSql(productAlias = 'p') {
  return `COALESCE((SELECT lc.id FROM product_category lc
    WHERE lc.id = ${productAlias}.category_id AND lc.supplier_id IS NULL
      AND lc.parent_category_id IS NOT NULL), ${OTHER_CATEGORY_ID_SQL})`
}

/** Predicate: `<categoryAlias>` (a product_category row) is a leaf platform category. */
export function isLeafCategorySql(categoryAlias = 'c') {
  return `(${categoryAlias}.supplier_id IS NULL AND ${categoryAlias}.parent_category_id IS NOT NULL)`
}
