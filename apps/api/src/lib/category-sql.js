/**
 * SQL helpers for reading platform categories while the category backfill may not be verified.
 * A product's `category_id` can still point at a supplier-owned or non-leaf category until the
 * backfill finishes; readers map those to the platform "Other" leaf so the API keeps serving.
 */

export const OTHER_CATEGORY_SLUG = 'other'

/**
 * The 16 original platform categories. Since 0240 they are leaves beside narrower ones but keep
 * their broad meaning ("Dairy" still covers cheese), so readers that match on a category treat
 * one of these as its whole department.
 */
export const BROAD_CATEGORY_SLUGS = [
  'vegetables',
  'meat-poultry',
  'seafood',
  'grains-legumes',
  'oils-fats',
  'dairy',
  'beverages',
  'spices-seasonings',
  'canned-preserved',
  'bakery-bread',
  'frozen-foods',
  'snacks-nuts',
  'condiments-sauces',
  'cleaning-supplies',
  'paper-disposables',
  'other',
]

const BROAD_SLUGS_SQL = BROAD_CATEGORY_SLUGS.filter((slug) => slug !== OTHER_CATEGORY_SLUG)
  .map((slug) => `'${slug}'`)
  .join(', ')

/**
 * Predicate: the leaf `leafIdSql` falls under the category `categoryIdSql`, i.e. it is that
 * category, or that category is a broad leaf and the leaf is in the same department.
 * Both arguments are trusted SQL expressions, not input.
 */
export function leafCoveredByCategorySql(leafIdSql, categoryIdSql) {
  return `(${leafIdSql} = ${categoryIdSql} OR EXISTS (
    SELECT 1 FROM product_category broad_c
    JOIN product_category sib_c ON sib_c.parent_category_id = broad_c.parent_category_id
    WHERE broad_c.id = ${categoryIdSql} AND broad_c.supplier_id IS NULL
      AND broad_c.slug IN (${BROAD_SLUGS_SQL}) AND sib_c.id = ${leafIdSql}))`
}

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

/**
 * Joins `<alias>` = the product's leaf platform category (the "Other" leaf for NULL,
 * supplier-owned or department ids) and `<alias>_dept` = its department. Both are LEFT
 * JOINs, so the product row is never dropped. Aliases are trusted identifiers, not input.
 * @param {string} [productAlias]
 * @param {string} [alias]
 */
export function leafCategoryJoinSql(productAlias = 'p', alias = 'lc') {
  return `LEFT JOIN product_category ${alias}_raw ON ${alias}_raw.id = ${productAlias}.category_id
      AND ${isLeafCategorySql(`${alias}_raw`)}
    LEFT JOIN product_category ${alias}
      ON ${alias}.id = COALESCE(${alias}_raw.id, ${OTHER_CATEGORY_ID_SQL})
    LEFT JOIN product_category ${alias}_dept ON ${alias}_dept.id = ${alias}.parent_category_id`
}

/**
 * Select-list columns for a `leafCategoryJoinSql` join: `category` (the platform name, kept
 * for readers of the old text field), `category_id`, `category_name`, `category_name_ar`,
 * `category_slug`, `department_id`.
 * @param {string} [alias]
 */
export function leafCategoryColumnsSql(alias = 'lc') {
  return `${alias}.name AS category,
    ${alias}.id AS category_id,
    ${alias}.name AS category_name,
    ${alias}.name_ar AS category_name_ar,
    ${alias}.slug AS category_slug,
    ${alias}.parent_category_id AS department_id`
}

/**
 * Predicate for `?categoryId=`: the joined leaf is the id, or its department is.
 * @param {string} placeholder a bound parameter such as `$3` (never raw input)
 * @param {string} [alias]
 */
export function categoryFilterSql(placeholder, alias = 'lc') {
  return `(${alias}.id = ${placeholder}::uuid OR ${alias}.parent_category_id = ${placeholder}::uuid)`
}

/**
 * Expression: uuid[] of the product's non-archived shelves (empty when none).
 * @param {string} [productAlias]
 */
export function productShelfIdsSql(productAlias = 'p') {
  return `COALESCE(ARRAY(SELECT ps.shelf_id FROM product_shelf ps
      JOIN supplier_shelf sh ON sh.id = ps.shelf_id AND sh.archived_at IS NULL
      WHERE ps.product_id = ${productAlias}.id ORDER BY ps.shelf_id), '{}'::uuid[])`
}
