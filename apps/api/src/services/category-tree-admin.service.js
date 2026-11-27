/**
 * Admin edits to the platform category tree: add a leaf, rename / re-alias / re-icon a node,
 * reorder siblings. Departments are seeded; deleting or deactivating nodes is out of scope
 * (products always need a live leaf). Every edit bumps the catalog version, which also
 * refreshes the matcher's `platformCategories:<version>` cache.
 */
import { query as defaultQuery, withTransaction } from '../lib/db.js'
import { bumpCatalogVersionSafe } from '../lib/relationship-cache.js'
import {
  CatalogError,
  catalogNotFound,
  catalogValidation,
  isUniqueViolation,
} from '../lib/catalog-errors.js'
import { insertLeafCategory } from './category-requests.service.js'
import { uniqueIds } from './shelves.service.js'

const NODE_COLUMNS = `id, slug, name, name_ar, name_fr, aliases, icon_key, parent_category_id,
  display_order`

export async function addLeafCategory(fields) {
  const category = await withTransaction((client) => insertLeafCategory(client, fields))
  await bumpCatalogVersionSafe()
  return category
}

/** @param {{ name?, name_ar?, name_fr?, aliases?, icon_key? }} updates */
export async function updatePlatformCategory(id, updates) {
  const fields = []
  const values = []
  const set = (column, value, cast = '') => {
    values.push(value)
    fields.push(`${column} = $${values.length}${cast}`)
  }
  if (updates.name !== undefined) set('name', updates.name.trim())
  for (const key of ['name_ar', 'name_fr', 'icon_key']) {
    if (updates[key] !== undefined) set(key, updates[key]?.trim() || null)
  }
  if (updates.aliases !== undefined) {
    set('aliases', uniqueIds(updates.aliases.map((a) => String(a).trim())), '::text[]')
  }
  if (!fields.length) throw catalogValidation('invalidInput')
  values.push(id)
  let rows
  try {
    ;({ rows } = await defaultQuery(
      `UPDATE product_category SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${values.length} AND supplier_id IS NULL
       RETURNING ${NODE_COLUMNS}`,
      values
    ))
  } catch (error) {
    if (isUniqueViolation(error, 'idx_product_category_platform_parent_name')) {
      throw new CatalogError('CATEGORY_NAME_TAKEN', 'categoryNameTaken', 409)
    }
    throw error
  }
  if (!rows[0]) throw catalogNotFound('categoryNotFound')
  await bumpCatalogVersionSafe()
  return rows[0]
}

/**
 * Reorder siblings: `ids` must be exactly the active platform children of `parentId`
 * (departments when `parentId` is null), in the new order.
 */
export async function reorderPlatformCategories(parentId, ids) {
  const order = uniqueIds(ids)
  const categories = await withTransaction(async (client) => {
    const { rows: siblings } = await client.query(
      `SELECT id FROM product_category
       WHERE supplier_id IS NULL AND is_active
         AND parent_category_id IS NOT DISTINCT FROM $1::uuid
       FOR UPDATE`,
      [parentId]
    )
    const siblingIds = new Set(siblings.map((r) => r.id))
    if (siblingIds.size !== order.length || !order.every((id) => siblingIds.has(id))) {
      throw catalogValidation('invalidInput')
    }
    const { rows } = await client.query(
      `UPDATE product_category c SET display_order = o.ord - 1, updated_at = now()
       FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord)
       WHERE c.id = o.id
       RETURNING c.id, c.display_order`,
      [order]
    )
    return rows.sort((a, b) => a.display_order - b.display_order)
  })
  await bumpCatalogVersionSafe()
  return categories
}
