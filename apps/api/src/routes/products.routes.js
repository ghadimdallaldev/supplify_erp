import express from 'express'
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
import { query } from '../lib/db.js'
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
import {
  getSupplierProductAvailableQty,
  overlayProductRowsWithAuthoritativeStock,
} from '../services/supplier-stock.service.js'
import { getCache, setCache, deleteCache } from '../lib/cache.js'

const CATALOG_META_CACHE_TTL_SECONDS = 300

/** Slim product columns for list/search endpoints (avoids wide p.* scans). */
const PRODUCT_LIST_COLUMNS = `
  p.id,
  p.sku,
  p.name,
  p.description,
  p.category,
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

function catalogCategoriesCacheKey(supplierId) {
  return `productCats:${supplierId ?? 'all'}`
}

function catalogTagsCacheKey(supplierId) {
  return `productTags:${supplierId ?? 'all'}`
}

async function invalidateCatalogMetaCache(supplierId) {
  await Promise.all([
    deleteCache(catalogCategoriesCacheKey(supplierId)).catch(() => {}),
    deleteCache(catalogCategoriesCacheKey(null)).catch(() => {}),
    deleteCache(catalogTagsCacheKey(supplierId)).catch(() => {}),
    deleteCache(catalogTagsCacheKey(null)).catch(() => {}),
  ])
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

router.use(requireAuth, resolveTenantContext, resolveAdminContext)

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
  category: z.string().max(100).optional(),
  image_url: z.string().url().optional(),
  image_thumb_url: z.string().url().optional(),
  unit: z.string().max(20).optional(),
})

const productUpdateSchema = productCreateSchema.partial()

const productListSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(), // Support both old category and category_id
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

// Get product categories
router.get('/categories', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    const supplierId = tenant?.tenantType === 'SUPPLIER' ? tenant.tenantId : null

    const cacheKey = catalogCategoriesCacheKey(supplierId)
    let categories = await getCache(cacheKey)
    if (!Array.isArray(categories)) {
      const { rows } = await query(
        `
        SELECT
          pc.id,
          pc.name,
          pc.slug,
          pc.description,
          pc.display_order,
          COUNT(p.id)::int AS product_count
        FROM product_category pc
        LEFT JOIN product p ON p.category_id = pc.id
          AND ($1::uuid IS NULL OR p.supplier_id = $1)
        WHERE pc.is_active = true
        GROUP BY pc.id
        HAVING ($1::uuid IS NULL OR COUNT(p.id) > 0)
        ORDER BY product_count DESC, pc.display_order, pc.name
        `,
        [supplierId],
        req
      )
      categories = rows
      await setCache(cacheKey, categories, CATALOG_META_CACHE_TTL_SECONDS).catch(() => {})
    }

    return res.json({ ok: true, data: { categories }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.warn('Categories unavailable, returning empty list:', error.message)
    return res.json({ ok: true, data: { categories: [] }, error: null, requestId: req.requestId })
  }
})

// Get available tags (from all products; no-op when product.tags column does not exist)
router.get('/tags', async (req, res) => {
  try {
    const hasTags = await productHasTagsColumn()
    if (!hasTags) {
      return res.json({ ok: true, data: { tags: [] }, error: null, requestId: req.requestId })
    }
    const tenant = await getRequestTenant(req)
    const supplierId = tenant?.tenantType === 'SUPPLIER' ? tenant.tenantId : null
    const cacheKey = `productTags:${supplierId ?? 'all'}`
    let tagRows = await getCache(cacheKey)
    if (!Array.isArray(tagRows)) {
      const { rows } = await query(
        `
        SELECT DISTINCT tag
        FROM product, jsonb_array_elements_text(tags) AS tag
        WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
          AND ($1::uuid IS NULL OR supplier_id = $1)
        ORDER BY tag
        `,
        [supplierId],
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
      if (hasSearchVector) {
        whereConditions.push(`p.search_vector @@ plainto_tsquery('simple', $${paramIndex})`)
        queryParams.push(params.q)
        orderByClause = `ts_rank(p.search_vector, plainto_tsquery('simple', $${paramIndex})) DESC, p.created_at DESC`
        paramIndex++
      } else {
        whereConditions.push(`LOWER(p.name) LIKE $${paramIndex}`)
        queryParams.push(`%${params.q.toLowerCase()}%`)
        paramIndex++
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

    // Category filter (support both old category field and new category_id)
    if (params.categoryId) {
      whereConditions.push(`p.category_id = $${paramIndex}`)
      queryParams.push(params.categoryId)
      paramIndex++
    } else if (params.category) {
      // Fallback to plain category text match only to avoid dependency on product_category
      whereConditions.push(`p.category = $${paramIndex}`)
      queryParams.push(params.category)
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
      whereConditions.push(`p.supplier_id = $${paramIndex}`)
      queryParams.push(params.supplier)
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
    const needsInventoryJoin = Boolean(params.inStock || params.includeStock)
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
    const fetchLimit = useKeyset ? params.limit + 1 : params.limit

    const sql = `
      SELECT 
        ${PRODUCT_LIST_COLUMNS},
        s.id as supplier_id,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.minimum_order_amount as supplier_minimum_order_amount,
        ${availableQtyExpr},
        ${favoritedExpr},
        pr.amount as current_price,
        pr.currency
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
      ${inventoryJoin}
      LEFT JOIN LATERAL (
        SELECT amount, currency
        FROM price
        WHERE price.product_id = p.id
          AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
        ORDER BY valid_from DESC
        LIMIT 1
      ) pr ON true
      ${whereClause}
      ORDER BY ${orderByClause}${useKeyset ? ', p.id DESC' : ''}
      LIMIT $${paramIndex}${useKeyset ? '' : ` OFFSET $${paramIndex + 1}`}
    `

    if (useKeyset) {
      queryParams.push(fetchLimit)
    } else {
      queryParams.push(params.limit, params.offset)
    }

    const countSql = `
      SELECT COUNT(*)::int as total
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN LATERAL (
        SELECT amount
        FROM price
        WHERE price.product_id = p.id
          AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
        ORDER BY valid_from DESC
        LIMIT 1
      ) pr ON true
      ${whereClause}
    `

    const [mainResult, countResult] = await Promise.all([
      query(sql, queryParams),
      useKeyset ? Promise.resolve({ rows: [{ total: null }] }) : query(countSql, countParams),
    ])
    let { rows } = mainResult
    const { rows: countRows } = countResult

    let nextCursor = null
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

    if (tenant?.tenantType === 'RESTAURANT' && restaurantId) {
      rows = await enrichProductsWithResolvedPricing(rows, restaurantId)
    }

    if (params.includeStock || params.inStock) {
      rows = await overlayProductRowsWithAuthoritativeStock(rows)
      if (params.inStock) {
        rows = rows.filter((row) => Number(row.available_qty || 0) > 0)
      }
    }

    res.json({
      ok: true,
      data: {
        products: rows,
        pagination: {
          total: useKeyset ? null : parseInt(countRows[0].total),
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
          s.id AS supplier_id,
          s.name AS supplier_name,
          s.slug AS supplier_slug,
          pf.created_at AS favorited_at,
          true AS is_favorited,
          pr.amount AS current_price,
          pr.currency
        FROM product_favorite pf
        JOIN product p ON p.id = pf.product_id
        JOIN supplier s ON s.id = p.supplier_id
        LEFT JOIN LATERAL (
          SELECT amount, currency
          FROM price
          WHERE price.product_id = p.id
            AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
          ORDER BY valid_from DESC
          LIMIT 1
        ) pr ON true
        WHERE pf.restaurant_id = $1 AND pf.user_id = $2
        ORDER BY pf.created_at DESC
        LIMIT $3 OFFSET $4
        `,
        [restaurantId, userId, params.limit, params.offset]
      ),
      query(
        `
        SELECT COUNT(*)::int AS total
        FROM product_favorite pf
        WHERE pf.restaurant_id = $1 AND pf.user_id = $2
        `,
        [restaurantId, userId]
      ),
    ])

    const products = await enrichProductsWithResolvedPricing(rows, restaurantId)

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
      const { rows: linked } = await query(
        `
        SELECT 1
        FROM supplier_follow sf
        WHERE sf.supplier_id = $1
          AND sf.restaurant_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM supplier_blocklist sb
            WHERE sb.supplier_id = $1 AND sb.restaurant_id = $2
          )
        UNION
        SELECT 1
        FROM customer_order o
        JOIN order_item oi ON oi.order_id = o.id
        WHERE o.restaurant_id = $2
          AND oi.supplier_id = $1
        LIMIT 1
      `,
        [product.supplier_id, restaurantId]
      )
      if (!linked.length) {
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
      product = enriched
    }

    product.available_qty = await getSupplierProductAvailableQty(product.supplier_id, product.id)

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

    // For suppliers, ensure they can only create products for their own supplier record
    let supplierId = req.body.supplier_id

    if (req.userData.role === 'SUPPLIER') {
      supplierId = await getSupplierIdForRequest(req)
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

      // Check plan limits for suppliers
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
    }

    if (!supplierId) {
      throw new ValidationError('supplier_id is required')
    }

    // Use transaction to create product, price, and inventory together
    await query('BEGIN')

    try {
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
        'supplier_id, sku, name, name_ar, description, description_ar, brand, category, category_id, image_url, unit'
      let insertPlaceholders = '$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11'
      let insertValues = [
        supplierId,
        productData.sku,
        productData.name,
        productData.name_ar || null,
        productData.description || null,
        productData.description_ar || null,
        productData.brand || null,
        productData.category || null,
        req.body.category_id || null,
        productData.image_url || null,
        productData.unit || null,
      ]
      if (hasTags) {
        insertCols += ', tags'
        insertPlaceholders += ', $12::jsonb'
        insertValues.push(JSON.stringify(tagsArray))
      }

      const { rows } = await query(
        `INSERT INTO product (${insertCols}) VALUES (${insertPlaceholders}) RETURNING *`,
        insertValues
      )

      const product = rows[0]

      // Create price if provided
      if (req.body.price !== undefined && req.body.price !== null) {
        await query(
          `
          INSERT INTO price (product_id, amount, currency, valid_from)
          VALUES ($1, $2, 'USD', now())
        `,
          [product.id, req.body.price]
        )
      }

      // Create inventory if initial stock provided
      if (req.body.initialStock !== undefined && req.body.initialStock !== null) {
        await query(
          `
          INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, on_order_qty)
          VALUES ($1, $2, $3, 0, 0)
        `,
          [product.id, req.body.warehouse_id || null, req.body.initialStock]
        )
      }

      await query('COMMIT')

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

      await invalidateCatalogMetaCache(supplierId)

      res.status(201).json({
        ok: true,
        data: { product },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  } catch (error) {
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

    // Check ownership for suppliers
    if (req.userData.role === 'SUPPLIER') {
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
    }

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

    // Handle category_id separately
    if (req.body.category_id !== undefined) {
      updateFields.push(`category_id = $${paramIndex}`)
      updateValues.push(req.body.category_id || null)
      paramIndex++
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
        category: 'category',
        image_url: 'image_url',
        image_thumb_url: 'image_thumb_url',
        unit: 'unit',
      },
      { startIndex: paramIndex }
    )
    updateFields.push(...schemaFields)
    updateValues.push(...schemaValues)
    paramIndex = nextIndex

    if (updateFields.length === 0) {
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

    const { rows } = await query(
      `
      UPDATE product 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `,
      updateValues
    )

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

    await invalidateCatalogMetaCache(product.supplier_id)

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
