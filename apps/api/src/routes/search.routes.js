import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  resolveTenantContext,
  resolveAdminContext,
  requireAnyPermission,
  getRequestTenant,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { enrichProductsWithResolvedPricing } from '../services/resolve-product-price.service.js'

const router = express.Router()

const catalogReadAccess = requireAnyPermission('CATALOG_VIEW', 'ORDERS_VIEW', 'INVENTORY_VIEW')

router.use(requireAuth, resolveTenantContext, resolveAdminContext, catalogReadAccess)

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  grouped: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  limit: z
    .string()
    .transform((val) => {
      const n = parseInt(val, 10)
      const parsed = Number.isFinite(n) ? n : 10
      return Math.min(Math.max(parsed, 1), 50)
    })
    .default('10'),
})

const historyListSchema = z.object({
  entityType: z.enum(['product', 'supplier']).optional(),
  limit: z
    .string()
    .transform((val) => {
      const n = parseInt(val, 10)
      const parsed = Number.isFinite(n) ? n : 10
      return Math.min(Math.max(parsed, 1), 50)
    })
    .default('10'),
})

const historyUpsertSchema = z.object({
  entityType: z.enum(['product', 'supplier']),
  query: z.string().trim().min(1).max(200),
})

const historyDeleteSchema = z.object({
  entityType: z.enum(['product', 'supplier']).optional(),
  query: z.string().trim().min(1).max(200).optional(),
})

function resolveHistoryScope(req) {
  const userId = req.userData?.id
  if (!userId) {
    throw new ValidationError('User not found')
  }
  const tenant = req.tenantContext
  if (!tenant?.tenantId || !tenant?.tenantType) {
    throw new ValidationError('Tenant context required')
  }
  return {
    userId,
    tenantId: tenant.tenantId,
    tenantType: tenant.tenantType,
  }
}

async function searchProducts(q, limit, restaurantId) {
  const { rows } = await query(
    `
    SELECT
      p.*,
      s.name AS supplier_name,
      s.slug AS supplier_slug,
      ts_rank(p.search_vector, plainto_tsquery('simple', $1)) AS search_rank
    FROM product p
    JOIN supplier s ON s.id = p.supplier_id
    WHERE p.search_vector @@ plainto_tsquery('simple', $1)
    ORDER BY search_rank DESC, p.created_at DESC
    LIMIT $2
    `,
    [q, limit]
  )

  if (restaurantId && rows.length > 0) {
    return enrichProductsWithResolvedPricing(rows, restaurantId)
  }
  return rows
}

async function searchSuppliers(q, limit, restaurantId) {
  const params = [`%${q.toLowerCase()}%`, limit]
  let blocklistClause = ''
  if (restaurantId) {
    blocklistClause = `
      AND NOT EXISTS (
        SELECT 1 FROM supplier_blocklist sb
        WHERE sb.supplier_id = s.id AND sb.restaurant_id = $3
      )
    `
    params.push(restaurantId)
  }

  const { rows } = await query(
    `
    SELECT
      s.*,
      COALESCE(
        (SELECT COUNT(DISTINCT p.id) FROM product p WHERE p.supplier_id = s.id),
        0
      ) AS product_count
    FROM supplier s
    WHERE (
      LOWER(s.name) LIKE $1
      OR LOWER(COALESCE(s.contact_email, '')) LIKE $1
      OR LOWER(COALESCE(s.address_json->>'city', '')) LIKE $1
    )
    ${blocklistClause}
    ORDER BY s.name ASC
    LIMIT $2
    `,
    params
  )
  return rows
}

// Unified search (optional grouped results)
router.get('/', async (req, res) => {
  try {
    const params = searchQuerySchema.parse(req.query)
    const tenant = await getRequestTenant(req)
    const restaurantId = tenant?.tenantType === 'RESTAURANT' ? tenant.tenantId : null

    const [products, suppliers] = await Promise.all([
      searchProducts(params.q, params.limit, restaurantId),
      searchSuppliers(params.q, params.limit, restaurantId),
    ])

    const data = params.grouped
      ? { products, suppliers }
      : {
          results: [
            ...products.map((p) => ({ type: 'product', item: p })),
            ...suppliers.map((s) => ({ type: 'supplier', item: s })),
          ],
        }

    res.json({
      ok: true,
      data,
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
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Search error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Search failed' },
      requestId: req.requestId,
    })
  }
})

// List recent search history
router.get('/history', async (req, res) => {
  try {
    const params = historyListSchema.parse(req.query)
    const { userId, tenantId, tenantType } = resolveHistoryScope(req)

    const conditions = ['user_id = $1', 'tenant_id = $2', 'tenant_type = $3']
    const queryParams = [userId, tenantId, tenantType]
    let paramIndex = 4

    if (params.entityType) {
      conditions.push(`entity_type = $${paramIndex}`)
      queryParams.push(params.entityType)
      paramIndex++
    }

    queryParams.push(params.limit)

    const { rows } = await query(
      `
      SELECT id, entity_type, query, created_at
      FROM search_history
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
      `,
      queryParams
    )

    res.json({
      ok: true,
      data: { history: rows },
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
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('List search history error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list search history' },
      requestId: req.requestId,
    })
  }
})

// Upsert a search history entry (moves query to top on repeat)
router.post('/history', async (req, res) => {
  try {
    const body = historyUpsertSchema.parse(req.body)
    const { userId, tenantId, tenantType } = resolveHistoryScope(req)

    const { rows } = await query(
      `
      INSERT INTO search_history (user_id, tenant_id, tenant_type, entity_type, query)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, tenant_id, tenant_type, entity_type, query)
      DO UPDATE SET created_at = now()
      RETURNING id, entity_type, query, created_at
      `,
      [userId, tenantId, tenantType, body.entityType, body.query]
    )

    res.status(201).json({
      ok: true,
      data: { entry: rows[0] },
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
    logger.error('Upsert search history error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to save search history' },
      requestId: req.requestId,
    })
  }
})

// Delete search history (single entry or all for entity type)
router.delete('/history', async (req, res) => {
  try {
    const params = historyDeleteSchema.parse(req.body ?? req.query)
    const { userId, tenantId, tenantType } = resolveHistoryScope(req)

    const conditions = ['user_id = $1', 'tenant_id = $2', 'tenant_type = $3']
    const queryParams = [userId, tenantId, tenantType]
    let paramIndex = 4

    if (params.entityType) {
      conditions.push(`entity_type = $${paramIndex}`)
      queryParams.push(params.entityType)
      paramIndex++
    }
    if (params.query) {
      conditions.push(`query = $${paramIndex}`)
      queryParams.push(params.query)
      paramIndex++
    }

    const { rowCount } = await query(
      `DELETE FROM search_history WHERE ${conditions.join(' AND ')}`,
      queryParams
    )

    res.json({
      ok: true,
      data: { deleted: rowCount ?? 0 },
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
          message: 'Invalid parameters',
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
    logger.error('Delete search history error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to delete search history' },
      requestId: req.requestId,
    })
  }
})

export { router as searchRoutes }
