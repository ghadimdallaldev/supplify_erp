/**
 * Category requests (spec §5.3, §11.5): a supplier asks for a platform category that does not
 * exist; its products wait on "Other" with the review flag. An admin approves (creates the
 * leaf), merges (maps to an existing leaf and learns the name as an alias) or rejects.
 *
 * Every resolution runs in one transaction that locks the request row (`FOR UPDATE`) and only
 * acts on `pending`, so two admins can never both resolve it or create two categories.
 */
import { query as defaultQuery, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { normalizeCategoryText } from '../lib/category-matcher.js'
import { OTHER_CATEGORY_ID_SQL, isLeafCategorySql } from '../lib/category-sql.js'
import { bumpCatalogVersionSafe } from '../lib/relationship-cache.js'
import {
  CatalogError,
  catalogNotFound,
  catalogValidation,
  isUniqueViolation,
} from '../lib/catalog-errors.js'
import { t } from '../i18n/index.js'
import { notifyTenantUsers } from './notification/in-app.js'
import { uniqueIds } from './shelves.service.js'

export const CATEGORY_REQUEST_NOTIFICATION = 'CATEGORY_REQUEST_RESOLVED'

const REQUEST_COLUMNS = `cr.id, cr.supplier_id, cr.proposed_name, cr.proposed_name_ar,
  cr.normalized_name, cr.proposed_parent_id, cr.example_product_id, cr.status,
  cr.resolved_category_id, cr.resolved_by, cr.admin_note, cr.created_at, cr.resolved_at`

/** The key one pending request per supplier is unique on. */
export function normalizeRequestName(name) {
  return normalizeCategoryText(name).normalized
}

/** URL slug for a new platform category (ASCII; Arabic-only names fall back to `category`). */
export function categorySlugBase(name) {
  const slug = normalizeCategoryText(name)
    .normalized.replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'category'
}

const resolvedError = () =>
  new CatalogError('CATEGORY_REQUEST_RESOLVED', 'categoryRequestResolved', 409)

async function assertDepartment(db, departmentId) {
  const { rows } = await db.query(
    `SELECT id FROM product_category
     WHERE id = $1 AND supplier_id IS NULL AND parent_category_id IS NULL AND is_active`,
    [departmentId]
  )
  if (!rows[0]) throw catalogValidation('departmentNotFound')
}

/** Throws unless the id is an active leaf platform category; returns it. */
export async function assertLeafCategory(db, categoryId) {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.name_ar, c.parent_category_id, ${isLeafCategorySql('c')} AS is_leaf
     FROM product_category c
     WHERE c.id = $1 AND c.supplier_id IS NULL AND c.is_active`,
    [categoryId]
  )
  if (!rows[0]) throw catalogValidation('categoryNotFound')
  if (!rows[0].is_leaf) throw catalogValidation('categoryNotLeaf')
  return rows[0]
}

/**
 * Supplier: ask for a category and park the given products on "Other" for review. When the
 * supplier already has a pending request with the same folded name, the products join that
 * request instead (`alreadyRequested: true`), so approving it moves them too.
 * @param {string} supplierId the caller's branch
 * @param {{ proposedName: string, proposedNameAr?: string|null, proposedParentId?: string|null, productIds?: string[] }} body
 * @returns {Promise<{ request: object, alreadyRequested: boolean }>}
 */
export async function createCategoryRequest(supplierId, body) {
  const proposedName = body.proposedName.trim()
  const normalizedName = normalizeRequestName(proposedName)
  if (!normalizedName) throw catalogValidation('invalidInput')
  const productIds = uniqueIds(body.productIds)
  if (body.proposedParentId) await assertDepartment({ query: defaultQuery }, body.proposedParentId)

  const run = () =>
    withTransaction(async (client) => {
      if (productIds.length) {
        const { rows } = await client.query(
          `SELECT id FROM product WHERE id = ANY($1::uuid[]) AND supplier_id = $2 FOR UPDATE`,
          [productIds, supplierId]
        )
        if (rows.length !== productIds.length) throw catalogValidation('foreignProducts')
      }
      // Locking the pending row makes a concurrent resolution wait for us (or us for it: a row
      // resolved meanwhile no longer matches, and the products get a new request).
      const {
        rows: [pending],
      } = await client.query(
        `SELECT id FROM category_request
         WHERE supplier_id = $1 AND normalized_name = $2 AND status = 'pending'
         FOR UPDATE`,
        [supplierId, normalizedName]
      )
      let requestId = pending?.id
      if (!requestId) {
        const {
          rows: [created],
        } = await client.query(
          `INSERT INTO category_request (supplier_id, proposed_name, proposed_name_ar,
                                         normalized_name, proposed_parent_id, example_product_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            supplierId,
            proposedName,
            body.proposedNameAr?.trim() || null,
            normalizedName,
            body.proposedParentId || null,
            productIds[0] ?? null,
          ]
        )
        requestId = created.id
      }
      if (productIds.length) {
        await client.query(
          `UPDATE product
           SET category_id = ${OTHER_CATEGORY_ID_SQL}, category_needs_review = true,
               category_request_id = $1, updated_at = now()
           WHERE id = ANY($2::uuid[]) AND supplier_id = $3`,
          [requestId, productIds, supplierId]
        )
      }
      return { requestId, alreadyRequested: Boolean(pending) }
    })

  let result
  try {
    result = await run()
  } catch (error) {
    // Two first requests raced; the loser joins the winner's request.
    if (!isUniqueViolation(error, 'idx_category_request_pending_name')) throw error
    result = await run()
  }
  if (productIds.length) await bumpCatalogVersionSafe()
  return {
    request: await getCategoryRequest(result.requestId),
    alreadyRequested: result.alreadyRequested,
  }
}

/** One request with its product count and names for display. */
export async function getCategoryRequest(id, db = { query: defaultQuery }) {
  const { rows } = await listRows(db, { id })
  return rows[0] ?? null
}

function listRows(db, { id = null, supplierId = null, status = null, limit = 200 }) {
  return db.query(
    `SELECT ${REQUEST_COLUMNS},
            s.name AS supplier_name,
            parent.name AS proposed_parent_name, parent.name_ar AS proposed_parent_name_ar,
            rc.name AS resolved_category_name, rc.name_ar AS resolved_category_name_ar,
            (SELECT count(*)::int FROM product p WHERE p.category_request_id = cr.id) AS product_count
     FROM category_request cr
     JOIN supplier s ON s.id = cr.supplier_id
     LEFT JOIN product_category parent ON parent.id = cr.proposed_parent_id
     LEFT JOIN product_category rc ON rc.id = cr.resolved_category_id
     WHERE ($1::uuid IS NULL OR cr.id = $1)
       AND ($2::uuid IS NULL OR cr.supplier_id = $2)
       AND ($3::text IS NULL OR cr.status = $3)
     ORDER BY (cr.status = 'pending') DESC, cr.created_at DESC
     LIMIT $4`,
    [id, supplierId, status, limit]
  )
}

/** Supplier: its own requests. Admin: everyone's (supplierId null). */
export async function listCategoryRequests({ supplierId = null, status = null, limit = 200 } = {}) {
  const { rows } = await listRows({ query: defaultQuery }, { supplierId, status, limit })
  return rows
}

/** Lock a request inside a transaction; 404 when missing, 409 unless pending. */
async function lockPending(client, id) {
  const { rows } = await client.query(
    `SELECT ${REQUEST_COLUMNS} FROM category_request cr WHERE cr.id = $1 FOR UPDATE`,
    [id]
  )
  if (!rows[0]) throw catalogNotFound('categoryRequestNotFound')
  if (rows[0].status !== 'pending') throw resolvedError()
  return rows[0]
}

/** Move every product waiting on the request into the resolved category. */
async function moveRequestProducts(client, requestId, categoryId) {
  const { rowCount } = await client.query(
    `UPDATE product SET category_id = $2, category_needs_review = false, updated_at = now()
     WHERE category_request_id = $1`,
    [requestId, categoryId]
  )
  return rowCount
}

async function finish(client, request, status, { categoryId = null, adminUserId, note = null }) {
  await client.query(
    `UPDATE category_request
     SET status = $2, resolved_category_id = $3, resolved_by = $4, admin_note = $5,
         resolved_at = now()
     WHERE id = $1`,
    [request.id, status, categoryId, adminUserId ?? null, note]
  )
}

async function uniqueSlug(client, name) {
  const base = categorySlugBase(name)
  const { rows } = await client.query(
    `SELECT slug FROM product_category WHERE supplier_id IS NULL AND (slug = $1 OR slug LIKE $1 || '-%')`,
    [base]
  )
  const taken = new Set(rows.map((r) => r.slug))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/**
 * Create a leaf under a department (admin tree edit and request approval share this).
 * @param {{ query: Function }} client
 */
export async function insertLeafCategory(client, fields) {
  await assertDepartment(client, fields.parentId)
  const slug = await uniqueSlug(client, fields.name)
  try {
    const {
      rows: [category],
    } = await client.query(
      `INSERT INTO product_category (supplier_id, parent_category_id, name, name_ar, name_fr, aliases,
                                     icon_key, slug, display_order, is_active)
       VALUES (NULL, $1, $2, $3, $4, $5::text[], $6, $7,
               COALESCE((SELECT max(display_order) + 1 FROM product_category
                         WHERE parent_category_id = $1), 0), true)
       RETURNING id, slug, name, name_ar, name_fr, aliases, icon_key, parent_category_id,
                 display_order, supplier_id`,
      [
        fields.parentId,
        fields.name.trim(),
        fields.name_ar?.trim() || null,
        fields.name_fr?.trim() || null,
        uniqueIds((fields.aliases || []).map((a) => String(a).trim())),
        fields.icon_key || null,
        slug,
      ]
    )
    return category
  } catch (error) {
    if (isUniqueViolation(error, 'idx_product_category_platform_parent_name')) {
      throw new CatalogError('CATEGORY_NAME_TAKEN', 'categoryNameTaken', 409)
    }
    throw error
  }
}

/**
 * Admin: create the requested leaf and move the request's products into it.
 * @returns {Promise<{ request: object, category: object, movedProducts: number }>}
 */
export async function approveCategoryRequest(id, body = {}, { adminUserId = null } = {}) {
  const result = await withTransaction(async (client) => {
    const request = await lockPending(client, id)
    const parentId = body.parentId || request.proposed_parent_id
    if (!parentId) throw catalogValidation('departmentNotFound')
    const category = await insertLeafCategory(client, {
      parentId,
      name: body.name?.trim() || request.proposed_name,
      name_ar: body.name_ar ?? request.proposed_name_ar,
      name_fr: body.name_fr,
      aliases: body.aliases,
      icon_key: body.icon_key,
    })
    const movedProducts = await moveRequestProducts(client, request.id, category.id)
    await finish(client, request, 'approved', { categoryId: category.id, adminUserId })
    return { request, category, movedProducts }
  })
  await afterResolution('approved', result.request, result.category, result.movedProducts)
  return { ...result, request: await getCategoryRequest(id) }
}

/** Admin: map the request to an existing leaf and learn the proposed name as an alias. */
export async function mergeCategoryRequest(id, { categoryId }, { adminUserId = null } = {}) {
  const result = await withTransaction(async (client) => {
    const request = await lockPending(client, id)
    const category = await assertLeafCategory(client, categoryId)
    await client.query(
      `UPDATE product_category
       SET aliases = array_append(COALESCE(aliases, '{}'::text[]), $2), updated_at = now()
       WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(aliases, '{}'::text[])) a
                         WHERE lower(a) = lower($2))`,
      [category.id, request.proposed_name]
    )
    const movedProducts = await moveRequestProducts(client, request.id, category.id)
    await finish(client, request, 'merged', { categoryId: category.id, adminUserId })
    return { request, category, movedProducts }
  })
  await afterResolution('merged', result.request, result.category, result.movedProducts)
  return { ...result, request: await getCategoryRequest(id) }
}

/** Admin: decline. The products stay on "Other" with the review flag. */
export async function rejectCategoryRequest(id, { note = null } = {}, { adminUserId = null } = {}) {
  const request = await withTransaction(async (client) => {
    const locked = await lockPending(client, id)
    await finish(client, locked, 'rejected', { adminUserId, note: note?.trim() || null })
    return locked
  })
  await afterResolution('rejected', { ...request, admin_note: note?.trim() || null }, null, 0)
  return { request: await getCategoryRequest(id) }
}

async function afterResolution(outcome, request, category, movedProducts) {
  await bumpCatalogVersionSafe()
  await notifyCategoryRequestResolved({ outcome, request, category, movedProducts }).catch(
    (error) =>
      logger.warn('category request notification failed', {
        requestId: request.id,
        error: error.message,
      })
  )
}

/** Localized title/message for the supplier notice. */
export function categoryRequestNotice(locale, { outcome, request, category, movedProducts }) {
  const key = (k) => `notifications.categoryRequest.${outcome}${k}`
  const categoryName =
    (locale === 'ar' ? category?.name_ar : null) || category?.name || request.proposed_name
  const params = { proposedName: request.proposed_name, categoryName, count: movedProducts }
  let message = t(key('Message'), locale, params)
  if (outcome === 'rejected' && request.admin_note) {
    message += ` ${t('notifications.categoryRequest.rejectedNote', locale, { note: request.admin_note })}`
  }
  return { title: t(key('Title'), locale), message }
}

async function notifyCategoryRequestResolved({ outcome, request, category, movedProducts }) {
  return notifyTenantUsers({
    tenantId: request.supplier_id,
    tenantType: 'SUPPLIER',
    notificationType: CATEGORY_REQUEST_NOTIFICATION,
    notificationCategory: 'catalog_updates',
    contentForLocale: (locale) =>
      categoryRequestNotice(locale, { outcome, request, category, movedProducts }),
    referenceId: request.id,
    referenceType: 'CATEGORY_REQUEST',
    metadata: {
      categoryRequestId: request.id,
      outcome,
      categoryId: category?.id ?? null,
      movedProducts,
      ctaUrl: '/app/products?needsReview=1',
    },
  })
}
