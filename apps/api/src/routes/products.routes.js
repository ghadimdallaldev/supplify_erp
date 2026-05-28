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
    .transform((val) => parseInt(val, 10))
    .default('20'),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('0'),
})

// Get product categories
router.get('/categories', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    const supplierId = tenant?.tenantType === 'SUPPLIER' ? tenant.tenantId : null

    const { rows: categories } = await query(
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
      [supplierId]
    )

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
    const { rows: tags } = await query(`
      SELECT DISTINCT tag
      FROM product, jsonb_array_elements_text(tags) AS tag
      WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
      ORDER BY tag
    `)
    return res.json({
      ok: true,
      data: { tags: tags.map((t) => t.tag) },
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

    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    if (scopedSupplierId) {
      whereConditions.push(`p.supplier_id = $${paramIndex}`)
      queryParams.push(scopedSupplierId)
      paramIndex++
    }

    // Text search
    if (params.q) {
      whereConditions.push(`LOWER(p.name) LIKE $${paramIndex}`)
      queryParams.push(`%${params.q.toLowerCase()}%`)
      paramIndex++
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

    // In stock filter
    if (params.inStock) {
      whereConditions.push(`inv.total_available > 0`)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const sql = `
      SELECT 
        p.*,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.contact_email as supplier_email,
        COALESCE(inv.total_available, 0) as available_qty,
        pr.amount as current_price,
        pr.currency
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN (
        SELECT product_id, SUM(available_qty) as total_available
        FROM inventory
        GROUP BY product_id
      ) inv ON inv.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT amount, currency
        FROM price
        WHERE price.product_id = p.id
          AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
        ORDER BY valid_from DESC
        LIMIT 1
      ) pr ON true
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    queryParams.push(params.limit, params.offset)

    let { rows } = await query(sql, queryParams)

    if (tenant?.tenantType === 'RESTAURANT') {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (restaurantId) {
        rows = await enrichProductsWithResolvedPricing(rows, restaurantId)
      }
    }

    // Get total count for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM product p
      LEFT JOIN inventory i ON i.product_id = p.id
      ${whereClause}
    `

    const countParams = queryParams.slice(0, -2) // Remove limit and offset
    const { rows: countRows } = await query(countSql, countParams)

    res.json({
      ok: true,
      data: {
        products: rows,
        pagination: {
          total: parseInt(countRows[0].total),
          limit: params.limit,
          offset: params.offset,
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

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { rows } = await query(
      `
      SELECT 
        p.*,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.contact_email as supplier_email,
        i.available_qty,
        pr.amount as current_price,
        pr.currency
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
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
    if (detailTenant?.tenantType === 'RESTAURANT') {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (restaurantId) {
        const [enriched] = await enrichProductsWithResolvedPricing([product], restaurantId)
        product = enriched
      }
    }

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
      // Find supplier by user email
      const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
        req.userData.email,
      ])

      if (suppliers.length === 0) {
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

      supplierId = suppliers[0].id

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
          recommendedPlans
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
    const { rows: existingProducts } = await query(
      'SELECT p.*, s.contact_email FROM product p JOIN supplier s ON s.id = p.supplier_id WHERE p.id = $1',
      [id]
    )

    if (existingProducts.length === 0) {
      throw new NotFoundError('Product not found')
    }

    const product = existingProducts[0]

    // Check ownership for suppliers
    if (req.userData.role === 'SUPPLIER' && product.contact_email !== req.userData.email) {
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
