import express from 'express'
import { tenantFeatureGate } from '../lib/tenant-feature-gate.js'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  resolveAdminContext,
  requirePermission,
  requireAnyPermission,
  getRequestTenant,
  getRestaurantIdForRequest,
  getSupplierIdForRequest,
} from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import {
  checkLimit,
  incrementUsage,
  getTenantSubscription,
  getRecommendedPlanNames,
  buildLimitExceededPayload,
  ensureStorageForUpload,
} from '../lib/subscription.js'
import { z } from 'zod'
import { buildWhitelistedUpdate } from '../lib/safe-update.js'
import { writeAuditLog } from '../lib/audit.js'
import { enrichProductsWithResolvedPricing } from '../services/resolve-product-price.service.js'
import { toContainsPattern, toPrefixTsQuery } from '../lib/search-query.js'
import {
  getSupplierProductAvailableQty,
  overlayProductRowsWithAuthoritativeStock,
} from '../services/supplier-stock.service.js'
import { syncWarehouseMirrorFromLegacy } from '../services/supplier-order-stock.service.js'
import { getCache, setCache } from '../lib/cache.js'
import {
  bumpCatalogVersionSafe,
  getCatalogVersion,
  restaurantCatalogMetaKey,
  supplierCatalogMetaKey,
} from '../lib/relationship-cache.js'
import {
  blockedExistsSql,
  catalogVisibleSql,
  followExistsSql,
  getRelationship,
} from '../lib/relationship.js'
import {
  applyRestaurantStockView,
  applyRestaurantStockViewToRows,
} from '../lib/restaurant-catalog-view.js'
import { getWarehouseSupplierColumn } from '../lib/warehouse-helpers.js'
import {
  categoryFilterSql,
  leafCategoryColumnsSql,
  productShelfIdsSql,
  leafCategoryJoinSql,
} from '../lib/category-sql.js'
import { loadPlatformCategories } from '../lib/category-matcher.js'
import { CatalogError, catalogValidation, sendCatalogError } from '../lib/catalog-errors.js'
import { assertLeafCategory } from '../services/category-requests.service.js'
import {
  assertOwnShelves,
  replaceProductShelves,
  shelfIdsForProducts,
} from '../services/shelves.service.js'
import { shelvesRouter } from './products/shelves.js'
import { categoryRequestsRouter } from './products/category-requests.js'
import {
  buildCategoryTree,
  categorySuggestions,
  productQueryCategoryIds,
} from '../lib/category-tree.js'

const CATALOG_META_CACHE_TTL_SECONDS = 300

/** Slim product columns for list/search endpoints (avoids wide p.* scans). */
const PRODUCT_LIST_COLUMNS = `
  p.id,
  p.sku,
  p.name,
  p.description,
  ${leafCategoryColumnsSql('lc')},
  p.category_needs_review,
  p.unit,
  p.supplier_id,
  p.image_url,
  p.image_thumb_url,
  p.tags,
  p.created_at,
  p.updated_at,
  COALESCE(pis.moq, 1) AS moq,
  COALESCE(pis.order_multiple, 1) AS order_multiple
`

function buildInventoryJoin(scopedSupplierId, supplierParamIndex) {
  if (scopedSupplierId && supplierParamIndex != null) {
    return `LEFT JOIN (
        SELECT i.product_id, SUM(i.available_qty) as total_available
        FROM inventory i
        INNER JOIN product inv_p ON inv_p.id = i.product_id AND inv_p.supplier_id = $${supplierParamIndex}
        GROUP BY i.product_id
      ) inv ON inv.product_id = p.id`
  }
  // Unscoped catalog: correlate per product instead of scanning/aggregating all inventory rows.
  return `LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(i.available_qty), 0) as total_available
        FROM inventory i
        WHERE i.product_id = p.id
      ) inv ON true`
}

/**
 * Catalog meta (category counts, tags) is cached per viewer and per catalogVersion:
 * restaurants only count catalogs visible to them (catalogVisibleSql), suppliers their own,
 * admin everything. Any product write bumps catalogVersion instead of deleting keys.
 */
async function catalogMetaScope(req, kind) {
  const tenant = await getRequestTenant(req)
  const version = await getCatalogVersion()
  if (tenant?.tenantType === 'RESTAURANT') {
    return {
      supplierId: null,
      restaurantId: tenant.tenantId,
      cacheKey: restaurantCatalogMetaKey(kind, tenant.tenantId, version),
    }
  }
  const supplierId = tenant?.tenantType === 'SUPPLIER' ? tenant.tenantId : null
  return {
    supplierId,
    restaurantId: null,
    cacheKey: supplierCatalogMetaKey(kind, supplierId, version),
  }
}

/** SQL predicate on product row `p`: visible to restaurant `$<idx>` (TRUE when $idx is NULL). */
function restaurantVisibleProductSql(paramIdx) {
  const param = `$${paramIdx}::uuid`
  return `(${param} IS NULL OR EXISTS (
    SELECT 1 FROM supplier vis_s
    WHERE vis_s.id = p.supplier_id AND ${catalogVisibleSql(param, 'vis_s')}
  ))`
}

async function invalidateCatalogMetaCache() {
  await bumpCatalogVersionSafe()
}

function encodeProductCursor(createdAt, id) {
  const payload = `${new Date(createdAt).toISOString()},${id}`
  return Buffer.from(payload, 'utf8').toString('base64url')
}

function decodeProductCursor(cursor) {
  if (!cursor) return null
  let decoded = cursor
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    decoded = cursor
  }
  const commaIdx = decoded.lastIndexOf(',')
  if (commaIdx <= 0) return null
  const createdAt = decoded.slice(0, commaIdx)
  const id = decoded.slice(commaIdx + 1)
  const ts = new Date(createdAt)
  if (!id || Number.isNaN(ts.getTime())) return null
  return { createdAt: ts.toISOString(), id }
}

const router = express.Router()

const catalogReadAccess = requireAnyPermission('CATALOG_VIEW', 'ORDERS_VIEW', 'INVENTORY_VIEW')

router.use(
  requireAuth,
  resolveTenantContext,
  resolveAdminContext,
  tenantFeatureGate('product_catalog')
)

router.use((req, res, next) => {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') return catalogReadAccess(req, res, next)
  if (method === 'DELETE') return requirePermission('CATALOG_MANAGE')(req, res, next)
  return requireAnyPermission('CATALOG_EDIT', 'CATALOG_MANAGE')(req, res, next)
})

// Lazy cache: does product table have a tags column? (migration 0026 adds it)
let _productHasTagsColumn = null
async function productHasTagsColumn() {
  if (_productHasTagsColumn !== null) return _productHasTagsColumn
  try {
    const { rows } = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'tags' LIMIT 1`
    )
    _productHasTagsColumn = rows.length > 0
  } catch {
    _productHasTagsColumn = false
  }
  return _productHasTagsColumn
}
/** Reset cache for tests so productHasTagsColumn() is re-queried */
export function __resetProductTagsColumnCache() {
  _productHasTagsColumn = null
  _productHasSearchVectorColumn = null
}

let _productHasSearchVectorColumn = null
async function productHasSearchVectorColumn() {
  if (_productHasSearchVectorColumn !== null) return _productHasSearchVectorColumn
  try {
    const { rows } = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'search_vector' LIMIT 1`
    )
    _productHasSearchVectorColumn = rows.length > 0
  } catch {
    _productHasSearchVectorColumn = false
  }
  return _productHasSearchVectorColumn
}

// Validation schemas
const productCreateSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  description_ar: z.string().max(1000).optional(),
  brand: z.string().max(100).optional(),
  /** Ignored: the legacy text column is no longer written (category_id is the category). */
  category: z.string().max(100).optional(),
  category_id: z.string().uuid().nullable().optional(),
  /** The caller branch's own, non-archived shelves; on update the list replaces the old one. */
  shelfIds: z.array(z.string().uuid()).max(100).optional(),
  image_url: z.string().url().optional(),
  image_thumb_url: z.string().url().optional(),
  unit: z.string().max(20).optional(),
})

const productUpdateSchema = productCreateSchema.partial()

const productListSchema = z.object({
  q: z.string().optional(),
  /** A department id (all its categories) or a category id. */
  categoryId: z.string().uuid().optional(),
  tags: z.string().optional(), // Comma-separated tags
  supplier: z.string().uuid().optional(),
  inStock: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  /** When true, include real available_qty in list rows (no filter). Opt-in for performance. */
  includeStock: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  /** When true, return only products favorited by the current user (restaurant). */
  favoritesOnly: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  /** Supplier catalog: only products waiting for a category (on Other for review). */
  needsReview: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .optional(),
  /** Only products on this shelf. */
  shelfId: z.string().uuid().optional(),
  minPrice: z
    .string()
    .transform((val) => (val ? parseFloat(val) : undefined))
    .optional(),
  maxPrice: z
    .string()
    .transform((val) => (val ? parseFloat(val) : undefined))
    .optional(),
  limit: z
    .string()
    .transform((val) => {
      const n = parseInt(val, 10)
      const parsed = Number.isFinite(n) ? n : 20
      return Math.min(Math.max(parsed, 1), 100)
    })
    .default('20'),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('0'),
  /** Keyset cursor (base64 or "created_at,id") for large catalogs */
  cursor: z.string().optional(),
})

// Platform category tree: departments → categories with per-viewer product counts.
// Restaurants count catalog-visible suppliers only and never see empty nodes; suppliers get
// the full tree with their own counts; admins the full tree with all counts.
router.get('/categories', async (req, res) => {
  try {
    const { supplierId, restaurantId, cacheKey } = await catalogMetaScope(req, 'categoryTree')
    let tree = await getCache(cacheKey)
    if (!Array.isArray(tree?.departments)) {
      const { rows } = await query(
        `
        WITH counts AS (
          SELECT lc.id AS category_id, COUNT(DISTINCT p.id)::int AS product_count
          FROM product p
          ${leafCategoryJoinSql('p', 'lc')}
          WHERE ($1::uuid IS NULL OR p.supplier_id = $1)
            AND ${restaurantVisibleProductSql(2)}
          GROUP BY lc.id
        )
        SELECT pc.id, pc.slug, pc.name, pc.name_ar, pc.name_fr, pc.icon_key,
               pc.parent_category_id, pc.display_order,
               COALESCE(counts.product_count, 0)::int AS product_count
        FROM product_category pc
        LEFT JOIN counts ON counts.category_id = pc.id
        WHERE pc.is_active = true AND pc.supplier_id IS NULL
        `,
        [supplierId, restaurantId],
        req
      )
      tree = buildCategoryTree(rows, { omitEmpty: Boolean(restaurantId) })
      await setCache(cacheKey, tree, CATALOG_META_CACHE_TTL_SECONDS).catch(() => {})
    }

    return res.json({ ok: true, data: tree, error: null, requestId: req.requestId })
  } catch (error) {
    logger.warn('Categories unavailable, returning empty tree:', error.message)
    return res.json({ ok: true, data: { departments: [] }, error: null, requestId: req.requestId })
  }
})

const categorySuggestionSchema = z.object({ name: z.string().trim().max(200).default('') })

// Supplier: platform category suggestions for a product name (top 3, score ≥ 0.6).
router.get('/category-suggestions', requireRole(['SUPPLIER', 'ADMIN']), async (req, res, next) => {
  try {
    const { name } = categorySuggestionSchema.parse(req.query)
    const categories = await loadPlatformCategories()
    return res.json({
      ok: true,
      data: categorySuggestions(name, categories),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Product writes need an active leaf platform category (spec §5.3 / §11.5). Returns it, or
 * throws `chooseCategory` (missing), `categoryNotFound` or `categoryNotLeaf` (a department).
 */
async function assertProductCategory(categoryId) {
  if (!categoryId) throw catalogValidation('chooseCategory')
  return assertLeafCategory({ query }, categoryId)
}

// Supplier shelves and category requests (they replace the removed supplier /categories CRUD).
router.use('/shelves', shelvesRouter)
router.use('/category-requests', categoryRequestsRouter)

// Get available tags (from all products; no-op when product.tags column does not exist)
router.get('/tags', async (req, res) => {
  try {
    const hasTags = await productHasTagsColumn()
    if (!hasTags) {
      return res.json({ ok: true, data: { tags: [] }, error: null, requestId: req.requestId })
    }
    const { supplierId, restaurantId, cacheKey } = await catalogMetaScope(req, 'productTags')
    let tagRows = await getCache(cacheKey)
    if (!Array.isArray(tagRows)) {
      const { rows } = await query(
        `
        SELECT DISTINCT tag
        FROM product p, jsonb_array_elements_text(p.tags) AS tag
        WHERE p.tags IS NOT NULL AND jsonb_array_length(p.tags) > 0
          AND ($1::uuid IS NULL OR p.supplier_id = $1)
          AND ${restaurantVisibleProductSql(2)}
        ORDER BY tag
        `,
        [supplierId, restaurantId],
        req
      )
      tagRows = rows
      await setCache(cacheKey, tagRows, CATALOG_META_CACHE_TTL_SECONDS).catch(() => {})
    }
    return res.json({
      ok: true,
      data: { tags: tagRows.map((t) => t.tag) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.warn('Tags unavailable, returning empty list:', error.message)
    return res.json({ ok: true, data: { tags: [] }, error: null, requestId: req.requestId })
  }
})

// List products with filters
router.get('/', async (req, res) => {
  try {
    const params = productListSchema.parse(req.query)
    const tenant = await getRequestTenant(req)
    const scopedSupplierId = tenant?.tenantType === 'SUPPLIER' ? tenant.tenantId : null
    const restaurantId =
      tenant?.tenantType === 'RESTAURANT' ? await getRestaurantIdForRequest(req) : null
    const userId = req.userData?.id ?? null
    let requestedSupplierIds = null
    if (params.supplier) {
      const { rows: supplierScopeRows } = await query(
        `SELECT id
         FROM supplier
         WHERE COALESCE(organization_id, id) = $1
           AND COALESCE(is_branch_active, TRUE) = TRUE
         ORDER BY is_main_branch DESC, created_at ASC, id ASC`,
        [params.supplier]
      )
      // Keep the requested UUID as a no-result sentinel when the public scope
      // does not exist; never broaden an unknown supplier to the full catalog.
      requestedSupplierIds = supplierScopeRows.map((row) => row.id)
      if (!requestedSupplierIds.length) requestedSupplierIds = [params.supplier]
    }

    const whereConditions = []
    const queryParams = []
    let paramIndex = 1
    let orderByClause = 'p.created_at DESC'

    if (scopedSupplierId) {
      whereConditions.push(`p.supplier_id = $${paramIndex}`)
      queryParams.push(scopedSupplierId)
      paramIndex++
    }

    // Full-text search (fallback to name LIKE when search_vector column absent)
    if (params.q) {
      const hasSearchVector = await productHasSearchVectorColumn()
      const prefixQuery = toPrefixTsQuery(params.q)
      // A query that names a category ("خبز", "pain") also returns that category's products.
      const queryCategoryIds = productQueryCategoryIds(params.q, await loadPlatformCategories())
      if (hasSearchVector && prefixQuery) {
        // Search-as-you-type: prefix lexemes plus a name substring, so "tom" finds "Tomatoes".
        whereConditions.push(
          `(p.search_vector @@ to_tsquery('simple', $${paramIndex}) OR LOWER(p.name) LIKE $${paramIndex + 1}
            OR lc.id = ANY($${paramIndex + 2}::uuid[]))`
        )
        queryParams.push(prefixQuery, toContainsPattern(params.q), queryCategoryIds)
        orderByClause = `ts_rank(p.search_vector, to_tsquery('simple', $${paramIndex})) DESC, p.created_at DESC`
        paramIndex += 3
      } else {
        whereConditions.push(
          `(LOWER(p.name) LIKE $${paramIndex} OR LOWER(p.sku) LIKE $${paramIndex}
            OR lc.id = ANY($${paramIndex + 1}::uuid[]))`
        )
        queryParams.push(`%${params.q.toLowerCase()}%`, queryCategoryIds)
        paramIndex += 2
      }
    }

    if (params.favoritesOnly) {
      if (!restaurantId || !userId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'favoritesOnly requires a restaurant user context',
          },
          requestId: req.requestId,
        })
      }
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM product_favorite pf
          WHERE pf.product_id = p.id
            AND pf.restaurant_id = $${paramIndex}
            AND pf.user_id = $${paramIndex + 1}
        )
      `)
      queryParams.push(restaurantId, userId)
      paramIndex += 2
    }

    // Platform category filter: a department id matches all its categories.
    if (params.categoryId) {
      whereConditions.push(categoryFilterSql(`$${paramIndex}`, 'lc'))
      queryParams.push(params.categoryId)
      paramIndex++
    }

    if (params.needsReview) {
      whereConditions.push('p.category_needs_review = true')
    }
    if (params.shelfId) {
      whereConditions.push(`EXISTS (SELECT 1 FROM product_shelf fps
        WHERE fps.product_id = p.id AND fps.shelf_id = $${paramIndex}::uuid)`)
      queryParams.push(params.shelfId)
      paramIndex++
    }

    // Tags filter (only when product.tags column exists)
    if (params.tags) {
      const hasTags = await productHasTagsColumn()
      if (hasTags) {
        const tagsArray = params.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t)
        if (tagsArray.length > 0) {
          whereConditions.push(`p.tags ?| $${paramIndex}::text[]`)
          queryParams.push(tagsArray)
          paramIndex++
        }
      }
    }

    // Supplier filter
    if (params.supplier) {
      whereConditions.push(`p.supplier_id = ANY($${paramIndex}::uuid[])`)
      queryParams.push(requestedSupplierIds)
      paramIndex++
    }

    // Restaurant catalog visibility (spec §10 Q2): not blocked AND (follows OR public catalog).
    let restaurantParamIdx = null
    if (restaurantId) {
      restaurantParamIdx = paramIndex
      whereConditions.push(catalogVisibleSql(`$${paramIndex}::uuid`, 's'))
      queryParams.push(restaurantId)
      paramIndex++
    }

    // Price range filter
    if (params.minPrice !== undefined) {
      whereConditions.push(`pr.amount >= $${paramIndex}`)
      queryParams.push(params.minPrice)
      paramIndex++
    }
    if (params.maxPrice !== undefined) {
      whereConditions.push(`pr.amount <= $${paramIndex}`)
      queryParams.push(params.maxPrice)
      paramIndex++
    }

    // In-stock filtering uses checkout-authoritative qty after overlay (warehouse fail-closed).
    // Do not filter on legacy inventory here — that falsely includes WH-mode products with stale legacy qty.

    const cursorTuple = params.cursor ? decodeProductCursor(params.cursor) : null
    if (params.cursor && !cursorTuple) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid cursor',
        },
        requestId: req.requestId,
      })
    }
    if (cursorTuple) {
      whereConditions.push(
        `(p.created_at, p.id) < ($${paramIndex}::timestamptz, $${paramIndex + 1}::uuid)`
      )
      queryParams.push(cursorTuple.createdAt, cursorTuple.id)
      paramIndex += 2
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    // Restaurants always get an in_stock flag, so their rows always get authoritative stock.
    const restaurantStockView = Boolean(restaurantId)
    const needsInventoryJoin = Boolean(params.inStock || params.includeStock || restaurantStockView)
    const supplierParamIndex = scopedSupplierId ? 1 : null
    const inventoryJoin = needsInventoryJoin
      ? buildInventoryJoin(scopedSupplierId, supplierParamIndex)
      : ''
    const availableQtyExpr = needsInventoryJoin
      ? 'COALESCE(inv.total_available, 0) as available_qty'
      : '0::int as available_qty'
    const countParams = [...queryParams]
    const favoritedExpr =
      restaurantId && userId
        ? `EXISTS (
        SELECT 1 FROM product_favorite pf
        WHERE pf.product_id = p.id
          AND pf.restaurant_id = $${paramIndex}
          AND pf.user_id = $${paramIndex + 1}
      ) as is_favorited`
        : 'false as is_favorited'
    if (restaurantId && userId) {
      queryParams.push(restaurantId, userId)
      paramIndex += 2
    }

    const useKeyset = Boolean(cursorTuple)
    const listSelectSql = `
      SELECT 
        ${PRODUCT_LIST_COLUMNS},
        ${scopedSupplierId ? `${productShelfIdsSql('p')} AS shelf_ids,` : ''}
        s.id as supplier_id,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.minimum_order_amount as supplier_minimum_order_amount,
        ${availableQtyExpr},
        ${favoritedExpr},
        ${
          restaurantParamIdx
            ? `${followExistsSql(`$${restaurantParamIdx}::uuid`, 's')} as is_followed`
            : 'false as is_followed'
        },
        pr.amount as current_price,
        pr.currency
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      ${leafCategoryJoinSql('p', 'lc')}
      LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
      ${inventoryJoin}
      LEFT JOIN LATERAL (
        SELECT amount, currency
        FROM price
        WHERE price.product_id = p.id
          AND valid_from <= now() AND (valid_to IS NULL OR valid_to >= now())
        ORDER BY (CASE WHEN COALESCE(min_qty, 1) <= 1 THEN 0 ELSE 1 END), valid_from DESC
        LIMIT 1
      ) pr ON true
      ${whereClause}
      ORDER BY ${orderByClause}${useKeyset ? ', p.id DESC' : ''}
    `

    const countNeedsPriceJoin = params.minPrice !== undefined || params.maxPrice !== undefined
    const countSql = `
      SELECT COUNT(*)::int as total
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      ${leafCategoryJoinSql('p', 'lc')}
      ${
        countNeedsPriceJoin
          ? `LEFT JOIN LATERAL (
        SELECT amount
        FROM price
        WHERE price.product_id = p.id
          AND valid_from <= now() AND (valid_to IS NULL OR valid_to >= now())
        ORDER BY (CASE WHEN COALESCE(min_qty, 1) <= 1 THEN 0 ELSE 1 END), valid_from DESC
        LIMIT 1
      ) pr ON true`
          : ''
      }
      ${whereClause}
    `

    /**
     * inStock filters after warehouse-authoritative overlay, so SQL LIMIT/OFFSET
     * alone under-fills pages. Scan ahead in batches until the page is filled.
     */
    const fetchInStockOffsetPage = async () => {
      const page = []
      let skipped = 0
      let dbOffset = 0
      const batchSize = Math.max(params.limit * 4, 40)
      let exhausted = false
      let safety = 0
      while (page.length < params.limit && !exhausted && safety < 25) {
        safety += 1
        const batchParams = [...queryParams, batchSize, dbOffset]
        const { rows: batchRows } = await query(
          `${listSelectSql}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          batchParams
        )
        if (batchRows.length < batchSize) exhausted = true
        dbOffset += batchRows.length
        if (batchRows.length === 0) break

        let enriched = batchRows
        if (tenant?.tenantType === 'RESTAURANT' && restaurantId) {
          enriched = await enrichProductsWithResolvedPricing(enriched, restaurantId)
        }
        enriched = await overlayProductRowsWithAuthoritativeStock(enriched)
        enriched = enriched.filter((row) => Number(row.available_qty || 0) > 0)

        for (const row of enriched) {
          if (skipped < params.offset) {
            skipped += 1
            continue
          }
          page.push(row)
          if (page.length >= params.limit) break
        }
      }
      return { rows: page, exhausted, scannedPastPage: skipped >= params.offset }
    }

    let rows
    let countRows
    let nextCursor = null

    if (params.inStock && !useKeyset) {
      const filled = await fetchInStockOffsetPage()
      rows = filled.rows
      // Exact in-stock total requires a full authoritative scan; report a lower bound
      // that still drives nextCursor when more in-stock rows may exist.
      const lowerBound = params.offset + rows.length + (filled.exhausted ? 0 : 1)
      countRows = [{ total: String(lowerBound) }]
      if (!filled.exhausted && rows.length > 0) {
        const last = rows[rows.length - 1]
        nextCursor = encodeProductCursor(last.created_at, last.id)
      }
    } else {
      const fetchLimit = useKeyset
        ? params.inStock
          ? Math.max(params.limit * 4, params.limit + 1)
          : params.limit + 1
        : params.limit
      const sql = `${listSelectSql}
      LIMIT $${paramIndex}${useKeyset ? '' : ` OFFSET $${paramIndex + 1}`}`
      const listParams = useKeyset
        ? [...queryParams, fetchLimit]
        : [...queryParams, params.limit, params.offset]

      const [mainResult, countResult] = await Promise.all([
        query(sql, listParams),
        useKeyset ? Promise.resolve({ rows: [{ total: null }] }) : query(countSql, countParams),
      ])
      rows = mainResult.rows
      countRows = countResult.rows

      if (tenant?.tenantType === 'RESTAURANT' && restaurantId) {
        rows = await enrichProductsWithResolvedPricing(rows, restaurantId)
      }

      if (params.includeStock || params.inStock || restaurantStockView) {
        rows = await overlayProductRowsWithAuthoritativeStock(rows)
        if (params.inStock) {
          rows = rows.filter((row) => Number(row.available_qty || 0) > 0)
        }
      }

      if (useKeyset && rows.length > params.limit) {
        const lastKept = rows[params.limit - 1]
        nextCursor = encodeProductCursor(lastKept.created_at, lastKept.id)
        rows = rows.slice(0, params.limit)
      } else if (!useKeyset && rows.length > 0) {
        const total = parseInt(countRows[0].total, 10)
        if (params.offset + rows.length < total) {
          const last = rows[rows.length - 1]
          nextCursor = encodeProductCursor(last.created_at, last.id)
        }
      }
    }

    if (restaurantStockView) rows = applyRestaurantStockViewToRows(rows)

    res.json({
      ok: true,
      data: {
        products: rows,
        pagination: {
          total: useKeyset ? null : parseInt(countRows[0].total, 10),
          limit: params.limit,
          offset: useKeyset ? null : params.offset,
          nextCursor,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error({
      message: 'List products error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list products',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

const favoriteProductSchema = z.object({
  productId: z.string().uuid(),
})

const favoriteListSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

// List favorited products (restaurant)
router.get('/favorites', requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const params = favoriteListSchema.parse(req.query)
    const restaurantId = await getRestaurantIdForRequest(req)
    const userId = req.userData?.id
    if (!restaurantId || !userId) {
      throw new ValidationError('Restaurant context required')
    }

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `
        SELECT
          p.*,
          ${leafCategoryColumnsSql('lc')},
          s.id AS supplier_id,
          s.name AS supplier_name,
          s.slug AS supplier_slug,
          pf.created_at AS favorited_at,
          true AS is_favorited,
          ${followExistsSql('$1', 's')} AS is_followed,
          pr.amount AS current_price,
          pr.currency
        FROM product_favorite pf
        JOIN product p ON p.id = pf.product_id
        JOIN supplier s ON s.id = p.supplier_id
        ${leafCategoryJoinSql('p', 'lc')}
        LEFT JOIN LATERAL (
          SELECT amount, currency
          FROM price
          WHERE price.product_id = p.id
            AND valid_from <= now() AND (valid_to IS NULL OR valid_to >= now())
          ORDER BY (CASE WHEN COALESCE(min_qty, 1) <= 1 THEN 0 ELSE 1 END), valid_from DESC
          LIMIT 1
        ) pr ON true
        WHERE pf.restaurant_id = $1 AND pf.user_id = $2
          AND NOT ${blockedExistsSql('$1', 's')}
        ORDER BY pf.created_at DESC
        LIMIT $3 OFFSET $4
        `,
        [restaurantId, userId, params.limit, params.offset]
      ),
      query(
        `
        SELECT COUNT(*)::int AS total
        FROM product_favorite pf
        JOIN product p ON p.id = pf.product_id
        JOIN supplier s ON s.id = p.supplier_id
        WHERE pf.restaurant_id = $1 AND pf.user_id = $2
          AND NOT ${blockedExistsSql('$1', 's')}
        `,
        [restaurantId, userId]
      ),
    ])

    // Favourites of a supplier the restaurant no longer follows stay listed, flagged
    // `can_order: false` so clients show "Follow to order" (spec §10 Q1). Blocked are hidden.
    const products = (await enrichProductsWithResolvedPricing(rows, restaurantId)).map((row) => {
      const { available_qty: _qty, ...rest } = row
      return { ...rest, is_followed: row.is_followed === true, can_order: row.is_followed === true }
    })

    res.json({
      ok: true,
      data: {
        products,
        pagination: {
          total: parseInt(countRows[0].total, 10),
          limit: params.limit,
          offset: params.offset,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('List product favorites error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list favorites' },
      requestId: req.requestId,
    })
  }
})

// Favorite a product (restaurant)
router.post('/favorites', requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { productId } = favoriteProductSchema.parse(req.body)
    const restaurantId = await getRestaurantIdForRequest(req)
    const userId = req.userData?.id
    if (!restaurantId || !userId) {
      throw new ValidationError('Restaurant context required')
    }

    const { rows: products } = await query('SELECT id FROM product WHERE id = $1', [productId])
    if (products.length === 0) {
      throw new NotFoundError('Product not found')
    }

    await query(
      `
      INSERT INTO product_favorite (restaurant_id, product_id, user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (restaurant_id, product_id, user_id) DO NOTHING
      `,
      [restaurantId, productId, userId]
    )

    res.status(201).json({
      ok: true,
      data: { productId, favorited: true },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Favorite product error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to favorite product' },
      requestId: req.requestId,
    })
  }
})

// Unfavorite a product (restaurant)
router.delete('/favorites/:productId', requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { productId } = req.params
    z.string().uuid().parse(productId)
    const restaurantId = await getRestaurantIdForRequest(req)
    const userId = req.userData?.id
    if (!restaurantId || !userId) {
      throw new ValidationError('Restaurant context required')
    }

    await query(
      'DELETE FROM product_favorite WHERE restaurant_id = $1 AND product_id = $2 AND user_id = $3',
      [restaurantId, productId, userId]
    )

    res.json({
      ok: true,
      data: { productId, favorited: false },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid product id' },
        requestId: req.requestId,
      })
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Unfavorite product error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to unfavorite product' },
      requestId: req.requestId,
    })
  }
})

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { rows } = await query(
      `
      SELECT 
        p.*,
        ${leafCategoryColumnsSql('lc')},
        lc_dept.name AS department_name,
        lc_dept.name_ar AS department_name_ar,
        s.id as supplier_id,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.minimum_order_amount as supplier_minimum_order_amount,
        COALESCE(pis.moq, 1) AS moq,
        COALESCE(pis.order_multiple, 1) AS order_multiple,
        i.available_qty,
        pr.amount as current_price,
        pr.currency
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      ${leafCategoryJoinSql('p', 'lc')}
      LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
      LEFT JOIN inventory i ON i.product_id = p.id
      LEFT JOIN price pr ON pr.product_id = p.id 
        AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
      WHERE p.id = $1
    `,
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Product not found',
        },
        requestId: req.requestId,
      })
    }

    let product = rows[0]
    const detailTenant = await getRequestTenant(req)

    if (detailTenant?.tenantType === 'SUPPLIER' || req.userData?.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId || product.supplier_id !== supplierId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Product not found',
          },
          requestId: req.requestId,
        })
      }
    } else if (detailTenant?.tenantType === 'RESTAURANT' || req.userData?.role === 'RESTAURANT') {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Product not found',
          },
          requestId: req.requestId,
        })
      }
      // Any restaurant may open a product of a visible catalog (spec D3 / §10 Q2): not blocked
      // AND (follows OR public catalog). A past order no longer grants access.
      const relationship = await getRelationship(restaurantId, product.supplier_id)
      if (relationship.blocked || !(relationship.following || relationship.publicCatalog)) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Product not found',
          },
          requestId: req.requestId,
        })
      }
      const [enriched] = await enrichProductsWithResolvedPricing([product], restaurantId)
      product = { ...enriched, is_followed: relationship.following }
    } else {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Product not found',
        },
        requestId: req.requestId,
      })
    }

    product.available_qty = await getSupplierProductAvailableQty(product.supplier_id, product.id)
    if (product.is_followed !== undefined) product = applyRestaurantStockView(product)

    delete product.supplier_email
    delete product.contact_email

    res.json({
      ok: true,
      data: { product },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get product error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get product',
      },
      requestId: req.requestId,
    })
  }
})

// Create product (supplier or admin only)
router.post('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const productData = productCreateSchema.parse(req.body)

    const supplierId = await getSupplierIdForRequest(req)
    if (!supplierId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Supplier record not found for user',
        },
        requestId: req.requestId,
      })
    }

    const limitCheck = await checkLimit(supplierId, 'SUPPLIER', 'supplier_products_skus')
    if (limitCheck.isOverLimit && !limitCheck.isUnlimited) {
      const [subscription, recommendedPlans] = await Promise.all([
        getTenantSubscription(supplierId, 'SUPPLIER'),
        getRecommendedPlanNames('SUPPLIER'),
      ])
      const err = buildLimitExceededPayload(
        limitCheck,
        'supplier_products_skus',
        subscription?.plan_name || subscription?.plan_display_name,
        recommendedPlans,
        undefined,
        'SUPPLIER'
      )
      return res.status(403).json({
        ok: false,
        data: null,
        error: err,
        requestId: req.requestId,
      })
    }

    const requestedWarehouseId =
      typeof req.body.warehouse_id === 'string' && req.body.warehouse_id.trim()
        ? req.body.warehouse_id.trim()
        : null
    if (requestedWarehouseId) {
      const parsedWarehouseId = z.string().uuid().safeParse(requestedWarehouseId)
      if (!parsedWarehouseId.success) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Invalid warehouse_id' },
          requestId: req.requestId,
        })
      }
      const supplierColumn = await getWarehouseSupplierColumn()
      const { rows: warehouseRows } = await query(
        `SELECT id FROM warehouse WHERE id = $1 AND ${supplierColumn} = $2 AND is_active = TRUE`,
        [parsedWarehouseId.data, supplierId]
      )
      if (!warehouseRows.length) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Warehouse not found for this supplier',
          },
          requestId: req.requestId,
        })
      }
    }

    await assertProductCategory(productData.category_id)
    const shelfIds = await assertOwnShelves({ query }, supplierId, productData.shelfIds)

    const hasTags = await productHasTagsColumn()
    const tagsArray =
      hasTags && req.body.tags
        ? Array.isArray(req.body.tags)
          ? req.body.tags
          : req.body.tags
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t)
        : []

    let insertCols =
      'supplier_id, sku, name, name_ar, description, description_ar, brand, category_id, image_url, unit'
    let insertPlaceholders = '$1, $2, $3, $4, $5, $6, $7, $8, $9, $10'
    let insertValues = [
      supplierId,
      productData.sku,
      productData.name,
      productData.name_ar || null,
      productData.description || null,
      productData.description_ar || null,
      productData.brand || null,
      productData.category_id,
      productData.image_url || null,
      productData.unit || null,
    ]
    if (hasTags) {
      insertCols += ', tags'
      insertPlaceholders += ', $11::jsonb'
      insertValues.push(JSON.stringify(tagsArray))
    }

    const product = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO product (${insertCols}) VALUES (${insertPlaceholders}) RETURNING *`,
        insertValues
      )

      const product = rows[0]
      await replaceProductShelves(client, supplierId, product.id, shelfIds)
      product.shelf_ids = shelfIds

      // Create price if provided
      if (req.body.price !== undefined && req.body.price !== null) {
        await client.query(
          `
          INSERT INTO price (product_id, amount, currency, valid_from)
          VALUES ($1, $2, 'USD', now())
        `,
          [product.id, req.body.price]
        )
      }

      // Create inventory if initial stock provided
      if (req.body.initialStock !== undefined && req.body.initialStock !== null) {
        await client.query(
          `
          INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, on_order_qty)
          VALUES ($1, $2, $3, 0, 0)
        `,
          [product.id, requestedWarehouseId, req.body.initialStock]
        )
        await syncWarehouseMirrorFromLegacy(client, {
          supplierId,
          productId: product.id,
          availableQty: Number(req.body.initialStock),
          reservedQty: 0,
          warehouseId: requestedWarehouseId || null,
        })
      }

      return product
    })

    // Track usage for supplier
    if (req.userData.role === 'SUPPLIER' && supplierId) {
      await incrementUsage(supplierId, 'SUPPLIER', 'supplier_products_skus', 1)
    }

    logger.info('Product created with price and inventory', {
      productId: product.id,
      sku: product.sku,
      actor: req.userData.id,
    })

    await writeAuditLog(req, {
      action_type: 'product.created',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: product.id,
      payload_json: { resource_type: 'product', sku: product.sku },
    })

    await invalidateCatalogMetaCache()

    res.status(201).json({
      ok: true,
      data: { product },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof CatalogError) return sendCatalogError(req, res, error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid product data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Create product error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create product',
      },
      requestId: req.requestId,
    })
  }
})

// Update product (supplier owner or admin only)
router.patch('/:id', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res, next) => {
  try {
    const { id } = req.params
    const updateData = productUpdateSchema.parse(req.body)

    // Check if product exists and user has permission
    const { rows: existingProducts } = await query('SELECT p.* FROM product p WHERE p.id = $1', [
      id,
    ])

    if (existingProducts.length === 0) {
      throw new NotFoundError('Product not found')
    }

    const product = existingProducts[0]

    const supplierId = await getSupplierIdForRequest(req)
    if (!supplierId || product.supplier_id !== supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Access denied. You can only update your own products',
        },
        requestId: req.requestId,
      })
    }

    if (updateData.category_id !== undefined) await assertProductCategory(updateData.category_id)
    const shelfIds =
      updateData.shelfIds !== undefined
        ? await assertOwnShelves({ query }, product.supplier_id, updateData.shelfIds)
        : null

    const imageSizeBytes =
      req.body.image_size_bytes != null ? Math.max(0, Number(req.body.image_size_bytes) || 0) : 0
    if (
      imageSizeBytes > 0 &&
      (updateData.image_url || req.body.image_url) &&
      req.userData.role !== 'ADMIN'
    ) {
      const metered = await ensureStorageForUpload(product.supplier_id, 'SUPPLIER', imageSizeBytes)
      if (!metered.allowed) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'LIMIT_EXCEEDED',
            message: `Storage limit reached (${metered.current}/${metered.limit} MB).`,
            details: {
              limitKey: 'storage_mb',
              limitValue: metered.limit ?? 0,
              currentUsage: metered.current ?? 0,
            },
          },
          requestId: req.requestId,
        })
      }
    }

    // Build dynamic update query
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    // Handle tags separately when product.tags column exists
    if (req.body.tags !== undefined) {
      const hasTags = await productHasTagsColumn()
      if (hasTags) {
        const tagsArray = Array.isArray(req.body.tags)
          ? req.body.tags
          : typeof req.body.tags === 'string'
            ? req.body.tags
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t)
            : []
        updateFields.push(`tags = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(tagsArray))
        paramIndex++
      }
    }

    // A new category resolves the review state. Forms resend the unchanged id, which must not
    // unlink a pending category request (approval moves the products it still holds).
    if (updateData.category_id !== undefined && updateData.category_id !== product.category_id) {
      updateFields.push(`category_id = $${paramIndex}`)
      updateValues.push(updateData.category_id)
      paramIndex++
      updateFields.push('category_needs_review = false', 'category_request_id = NULL')
    }

    const {
      fields: schemaFields,
      values: schemaValues,
      nextIndex,
    } = buildWhitelistedUpdate(
      updateData,
      {
        sku: 'sku',
        name: 'name',
        name_ar: 'name_ar',
        description: 'description',
        description_ar: 'description_ar',
        brand: 'brand',
        image_url: 'image_url',
        image_thumb_url: 'image_thumb_url',
        unit: 'unit',
      },
      { startIndex: paramIndex }
    )
    updateFields.push(...schemaFields)
    updateValues.push(...schemaValues)
    paramIndex = nextIndex

    if (updateFields.length === 0 && shelfIds === null && updateData.category_id === undefined) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'No fields to update',
        },
        requestId: req.requestId,
      })
    }

    updateFields.push(`updated_at = now()`)
    updateValues.push(id)

    const rows = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE product SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        updateValues
      )
      if (shelfIds !== null) {
        await replaceProductShelves(client, product.supplier_id, id, shelfIds)
      }
      return result.rows
    })
    rows[0].shelf_ids = (await shelfIdsForProducts({ query }, [id])).get(id) || []

    logger.info('Product updated', {
      productId: rows[0].id,
      actor: req.userData.id,
    })

    await writeAuditLog(req, {
      action_type: 'product.updated',
      tenant_type: 'SUPPLIER',
      tenant_id: product.supplier_id,
      target_id: rows[0].id,
      payload_json: { resource_type: 'product', changes: Object.keys(updateData) },
    })

    await invalidateCatalogMetaCache()

    res.json({
      ok: true,
      data: { product: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    // Let NotFoundError pass through to error handler (next middleware)
    if (error instanceof NotFoundError) {
      return next(error)
    }
    if (error instanceof CatalogError) return sendCatalogError(req, res, error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid update data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Update product error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update product',
      },
      requestId: req.requestId,
    })
  }
})

export { router as productsRoutes }
