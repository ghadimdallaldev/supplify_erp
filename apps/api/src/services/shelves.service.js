/**
 * Supplier shelves: a branch's own storefront groupings (spec §11.5). Shelves belong to the
 * branch supplier row, as products do; the composite foreign keys on product_shelf enforce
 * that in the database, and these helpers turn violations into clear 400s first.
 */
import { query as defaultQuery, withTransaction } from '../lib/db.js'
import { bumpCatalogVersionSafe } from '../lib/relationship-cache.js'
import { catalogVisibleSql } from '../lib/relationship.js'
import { leafCategoryJoinSql } from '../lib/category-sql.js'
import {
  CatalogError,
  catalogNotFound,
  catalogValidation,
  isUniqueViolation,
} from '../lib/catalog-errors.js'

/** Deal statuses that still apply, or will once approved or paid. */
export const LIVE_DEAL_STATUSES = [
  'pending_approval',
  'pending_admin_approval',
  'approved_pending_payment',
  'scheduled',
  'active',
]

const SHELF_COLUMNS = `s.id, s.name, s.name_ar, s.display_order, s.archived_at`

/** Distinct ids, order kept. */
export function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))]
}

/** The 409 body when a shelf is still referenced (spec: "refuses ... and lists them"). */
export function shelfInUseError(deals, rules) {
  return new CatalogError('SHELF_IN_USE', 'shelfInUse', 409, {
    deals: deals.map((d) => ({ id: d.id, name: d.name })),
    rules: rules.map((r) => ({ id: r.id, name: r.name })),
  })
}

function shelfNameError(error) {
  if (isUniqueViolation(error, 'idx_supplier_shelf_active_name')) {
    return new CatalogError('SHELF_NAME_TAKEN', 'shelfNameTaken', 409)
  }
  return error
}

/**
 * Throws `foreignShelf` unless every id is a non-archived shelf of this supplier.
 * @param {{ query: Function }} db
 */
export async function assertOwnShelves(db, supplierId, shelfIds) {
  const ids = uniqueIds(shelfIds)
  if (!ids.length) return ids
  const { rows } = await db.query(
    `SELECT id FROM supplier_shelf
     WHERE id = ANY($1::uuid[]) AND supplier_id = $2 AND archived_at IS NULL`,
    [ids, supplierId]
  )
  if (rows.length !== ids.length) throw catalogValidation('foreignShelf')
  return ids
}

/** Replace a product's shelves (ids already checked with assertOwnShelves). */
export async function replaceProductShelves(client, supplierId, productId, shelfIds) {
  await client.query('DELETE FROM product_shelf WHERE product_id = $1', [productId])
  if (!shelfIds.length) return
  await client.query(
    `INSERT INTO product_shelf (product_id, shelf_id, supplier_id)
     SELECT $1, unnest($2::uuid[]), $3
     ON CONFLICT DO NOTHING`,
    [productId, shelfIds, supplierId]
  )
}

/** Shelf ids per product id, for API responses. */
export async function shelfIdsForProducts(db, productIds) {
  const map = new Map()
  if (!productIds.length) return map
  const { rows } = await db.query(
    `SELECT ps.product_id, array_agg(ps.shelf_id ORDER BY s.display_order, s.name) AS shelf_ids
     FROM product_shelf ps
     JOIN supplier_shelf s ON s.id = ps.shelf_id AND s.archived_at IS NULL
     WHERE ps.product_id = ANY($1::uuid[])
     GROUP BY ps.product_id`,
    [productIds]
  )
  for (const row of rows) map.set(row.product_id, row.shelf_ids)
  return map
}

export async function listShelves(supplierId, db = { query: defaultQuery }) {
  const { rows } = await db.query(
    `SELECT ${SHELF_COLUMNS},
            (SELECT count(DISTINCT ps.product_id)::int FROM product_shelf ps
             WHERE ps.shelf_id = s.id) AS product_count
     FROM supplier_shelf s
     WHERE s.supplier_id = $1 AND s.archived_at IS NULL
     ORDER BY s.display_order, lower(s.name), s.id`,
    [supplierId]
  )
  return rows
}

/**
 * What a restaurant browses on a supplier page: the active shelves and the leaf platform
 * categories of the supplier's branches, each counting distinct products the restaurant can
 * see (followers-only catalogs count nothing until it follows; blocked suppliers nothing).
 * Empty shelves and categories are left out.
 * @param {string[]} supplierIds branch supplier ids of one organisation
 * @param {string} restaurantId
 */
export async function listRestaurantSupplierFacets(
  supplierIds,
  restaurantId,
  db = { query: defaultQuery }
) {
  const visible = catalogVisibleSql('$2::uuid', 's')
  const [{ rows: shelves }, { rows: categories }] = await Promise.all([
    db.query(
      `SELECT sh.id, sh.supplier_id, sh.name, sh.name_ar, sh.display_order,
              count(DISTINCT p.id)::int AS product_count
       FROM supplier_shelf sh
       JOIN product_shelf ps ON ps.shelf_id = sh.id
       JOIN product p ON p.id = ps.product_id
       JOIN supplier s ON s.id = p.supplier_id
       WHERE sh.supplier_id = ANY($1::uuid[]) AND sh.archived_at IS NULL AND ${visible}
       GROUP BY sh.id
       ORDER BY sh.display_order, lower(sh.name), sh.id`,
      [supplierIds, restaurantId]
    ),
    db.query(
      `SELECT lc.id, lc.slug, lc.name, lc.name_ar, lc.name_fr, lc.icon_key,
              lc.parent_category_id AS department_id,
              count(DISTINCT p.id)::int AS product_count
       FROM product p
       JOIN supplier s ON s.id = p.supplier_id
       ${leafCategoryJoinSql('p', 'lc')}
       WHERE p.supplier_id = ANY($1::uuid[]) AND ${visible}
       GROUP BY lc.id, lc.slug, lc.name, lc.name_ar, lc.name_fr, lc.icon_key,
                lc.parent_category_id, lc.display_order
       ORDER BY lc.display_order, lc.name`,
      [supplierIds, restaurantId]
    ),
  ])
  return { shelves, categories }
}

async function getOwnShelf(db, supplierId, shelfId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${SHELF_COLUMNS} FROM supplier_shelf s
     WHERE s.id = $1 AND s.supplier_id = $2 AND s.archived_at IS NULL
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [shelfId, supplierId]
  )
  if (!rows[0]) throw catalogNotFound('shelfNotFound')
  return rows[0]
}

export async function createShelf(supplierId, { name, name_ar = null }) {
  try {
    const { rows } = await defaultQuery(
      `INSERT INTO supplier_shelf (supplier_id, name, name_ar, display_order)
       VALUES ($1, $2, $3,
               COALESCE((SELECT max(display_order) + 1 FROM supplier_shelf
                         WHERE supplier_id = $1 AND archived_at IS NULL), 0))
       RETURNING id, name, name_ar, display_order, archived_at`,
      [supplierId, name, name_ar]
    )
    await bumpCatalogVersionSafe()
    return { ...rows[0], product_count: 0 }
  } catch (error) {
    throw shelfNameError(error)
  }
}

export async function updateShelf(supplierId, shelfId, updates) {
  const fields = []
  const values = []
  for (const key of ['name', 'name_ar', 'display_order']) {
    if (updates[key] !== undefined) {
      values.push(updates[key])
      fields.push(`${key} = $${values.length}`)
    }
  }
  if (!fields.length) throw catalogValidation('invalidInput')
  values.push(shelfId, supplierId)
  try {
    const { rows } = await defaultQuery(
      `UPDATE supplier_shelf SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${values.length - 1} AND supplier_id = $${values.length} AND archived_at IS NULL
       RETURNING id`,
      values
    )
    if (!rows[0]) throw catalogNotFound('shelfNotFound')
  } catch (error) {
    throw shelfNameError(error)
  }
  await bumpCatalogVersionSafe()
  return (await listShelves(supplierId)).find((s) => s.id === shelfId)
}

/** Replace the products on a shelf; every product must be this supplier's. */
export async function setShelfProducts(supplierId, shelfId, productIds) {
  const ids = uniqueIds(productIds)
  await withTransaction(async (client) => {
    await getOwnShelf(client, supplierId, shelfId, { forUpdate: true })
    if (ids.length) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM product WHERE id = ANY($1::uuid[]) AND supplier_id = $2`,
        [ids, supplierId]
      )
      if (rows[0].n !== ids.length) throw catalogValidation('foreignProducts')
    }
    await client.query('DELETE FROM product_shelf WHERE shelf_id = $1', [shelfId])
    if (ids.length) {
      await client.query(
        `INSERT INTO product_shelf (product_id, shelf_id, supplier_id)
         SELECT unnest($1::uuid[]), $2, $3`,
        [ids, shelfId, supplierId]
      )
    }
  })
  await bumpCatalogVersionSafe()
  return (await listShelves(supplierId)).find((s) => s.id === shelfId)
}

/**
 * Add and remove products on a shelf without restating the whole membership, so a client that
 * loaded only a page of members cannot drop the rest. `add` must be the supplier's products.
 */
export async function changeShelfProducts(supplierId, shelfId, { add = [], remove = [] }) {
  const addIds = uniqueIds(add)
  const removeIds = uniqueIds(remove).filter((id) => !addIds.includes(id))
  await withTransaction(async (client) => {
    await getOwnShelf(client, supplierId, shelfId, { forUpdate: true })
    if (addIds.length) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM product WHERE id = ANY($1::uuid[]) AND supplier_id = $2`,
        [addIds, supplierId]
      )
      if (rows[0].n !== addIds.length) throw catalogValidation('foreignProducts')
      await client.query(
        `INSERT INTO product_shelf (product_id, shelf_id, supplier_id)
         SELECT unnest($1::uuid[]), $2, $3
         ON CONFLICT DO NOTHING`,
        [addIds, shelfId, supplierId]
      )
    }
    if (removeIds.length) {
      await client.query(
        'DELETE FROM product_shelf WHERE shelf_id = $1 AND product_id = ANY($2::uuid[])',
        [shelfId, removeIds]
      )
    }
  })
  await bumpCatalogVersionSafe()
  return (await listShelves(supplierId)).find((s) => s.id === shelfId)
}

/** Set display_order from the given order; every id must be an active shelf of the supplier. */
export async function reorderShelves(supplierId, shelfIds) {
  const ids = uniqueIds(shelfIds)
  await withTransaction(async (client) => {
    await assertOwnShelves(client, supplierId, ids)
    await client.query(
      `UPDATE supplier_shelf s SET display_order = o.ord - 1, updated_at = now()
       FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord)
       WHERE s.id = o.id AND s.supplier_id = $2`,
      [ids, supplierId]
    )
  })
  await bumpCatalogVersionSafe()
  return listShelves(supplierId)
}

/**
 * Soft-delete. Refused with SHELF_IN_USE (listing the deals and rules) while a live deal or an
 * active routing rule targets the shelf; the lock keeps a concurrent deal edit from racing it.
 */
export async function archiveShelf(supplierId, shelfId) {
  await withTransaction(async (client) => {
    await getOwnShelf(client, supplierId, shelfId, { forUpdate: true })
    const [{ rows: deals }, { rows: rules }] = await Promise.all([
      client.query(
        `SELECT DISTINCT p.id, p.name
         FROM promotion_targets t JOIN promotions p ON p.id = t.promotion_id
         WHERE t.shelf_id = $1 AND p.status = ANY($2::text[])
           AND (p.ends_at IS NULL OR p.ends_at > now())
         ORDER BY p.name`,
        [shelfId, LIVE_DEAL_STATUSES]
      ),
      client.query(
        `SELECT r.id, w.name || ' (priority ' || COALESCE(r.priority, 1) || ')' AS name
         FROM warehouse_routing_rule r JOIN warehouse w ON w.id = r.warehouse_id
         WHERE r.shelf_id = $1 AND r.is_active
         ORDER BY r.priority, w.name`,
        [shelfId]
      ),
    ])
    if (deals.length || rules.length) throw shelfInUseError(deals, rules)
    await client.query(
      `UPDATE supplier_shelf SET archived_at = now(), updated_at = now() WHERE id = $1`,
      [shelfId]
    )
    // Memberships stay (readers ignore archived shelves), so an archive is reversible.
  })
  await bumpCatalogVersionSafe()
  return { id: shelfId }
}
