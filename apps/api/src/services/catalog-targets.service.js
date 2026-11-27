/**
 * Ownership and shape checks for anything that targets catalog items: deal targets and
 * warehouse routing rules (spec §11.5). Products and shelves must be the caller branch's own;
 * categories must be active leaf platform categories. Failures are CatalogErrors
 * (`foreignProducts`, `foreignShelf`, `categoryNotLeaf`, `categoryNotFound`).
 */
import { isLeafCategorySql } from '../lib/category-sql.js'
import { catalogValidation } from '../lib/catalog-errors.js'
import { assertOwnShelves, uniqueIds } from './shelves.service.js'

export { assertOwnShelves }

/** @param {{ query: Function }} db */
export async function assertOwnProducts(db, supplierId, productIds) {
  const ids = uniqueIds(productIds)
  if (!ids.length) return ids
  const { rows } = await db.query(
    `SELECT id FROM product WHERE id = ANY($1::uuid[]) AND supplier_id = $2`,
    [ids, supplierId]
  )
  if (rows.length !== ids.length) throw catalogValidation('foreignProducts')
  return ids
}

/** @param {{ query: Function }} db */
export async function assertLeafCategories(db, categoryIds) {
  const ids = uniqueIds(categoryIds)
  if (!ids.length) return ids
  const { rows } = await db.query(
    `SELECT c.id, ${isLeafCategorySql('c')} AS is_leaf
     FROM product_category c
     WHERE c.id = ANY($1::uuid[]) AND c.supplier_id IS NULL AND c.is_active`,
    [ids]
  )
  if (rows.length !== ids.length) throw catalogValidation('categoryNotFound')
  if (rows.some((r) => !r.is_leaf)) throw catalogValidation('categoryNotLeaf')
  return ids
}

/**
 * Validate deal targets and return them de-duplicated.
 * @returns {Promise<{ productIds: string[], categoryIds: string[], shelfIds: string[] }>}
 */
export async function validateDealTargets(db, supplierId, { productIds, categoryIds, shelfIds }) {
  return {
    productIds: await assertOwnProducts(db, supplierId, productIds),
    categoryIds: await assertLeafCategories(db, categoryIds),
    shelfIds: await assertOwnShelves(db, supplierId, shelfIds),
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ROUTING_RULE_TYPES = [
  'product',
  'category',
  'shelf',
  'zone',
  'stock_available',
  'default',
]

const TARGET_COLUMN = {
  product: 'product_id',
  category: 'category_id',
  shelf: 'shelf_id',
  zone: 'zone_id',
}

/**
 * Normalise a routing rule's target: the column its type needs is required and checked; every
 * other target column is cleared, so a rule never carries a stale id of another kind.
 * @returns {Promise<{ product_id, category_id, shelf_id, zone_id }>}
 */
export async function validateRoutingRuleTarget(db, supplierId, rule) {
  if (!ROUTING_RULE_TYPES.includes(rule.rule_type)) throw catalogValidation('invalidInput')
  const target = { product_id: null, category_id: null, shelf_id: null, zone_id: null }
  const column = TARGET_COLUMN[rule.rule_type]
  if (!column) return target
  const id = rule[column]
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw catalogValidation('invalidInput')
  if (rule.rule_type === 'product') await assertOwnProducts(db, supplierId, [id])
  if (rule.rule_type === 'category') await assertLeafCategories(db, [id])
  if (rule.rule_type === 'shelf') await assertOwnShelves(db, supplierId, [id])
  target[column] = id
  return target
}
